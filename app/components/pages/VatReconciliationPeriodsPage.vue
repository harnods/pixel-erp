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
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpButton, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { infoToast } from '~/utils/toasts'
import ReconciliationFiltersDrawer, {
  emptyReconciliationFilters, type ReconciliationFiltersValue,
} from '~/components/patterns/ReconciliationFiltersDrawer.vue'
// formatAmountPlain, not formatIDR: each header already carries "(Rp)", so the
// symbol on every cell is redundant — see docs/patterns/currency-format.md, a
// labelled money column is not a currency display.
import {
  reconPeriodRows, reconPeriodOptions, formatAmountPlain, loadVatSetup, reconVersion,
  type ReconPeriodRow,
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
// Widths are sized for the bare (no "Rp") figures. The first column carries the
// merged select-all checkbox on top of its text, so it needs ~40px more than the
// masa alone would suggest — at 100px it truncated to "05/2…".
// "Reconciliation" is dropped from both headers that carried it: on a page
// titled VAT reconciliation it's redundant three times over, and spelling it out
// clipped the headers at any width the table could afford.
const columns: TableColumn[] = [
  { key: 'masa',        label: t('Tax period'),    width: '140px', sortable: true,                 sortType: 'text'   },
  { key: 'reconciledAt',label: t('Reconciled on'), width: '145px', sortable: true,                 sortType: 'date'   },
  { key: 'jenis',       label: t('Invoice type'),  width: '160px',                                 sortType: 'text'   },
  { key: 'erpAmount',   label: t('Sales/purchase invoice (Rp)'), width: '195px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'djpAmount',   label: t('Tax invoice (Rp)'), width: '180px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'selisih',     label: t('Difference (Rp)'), width: '130px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'status',      label: t('Status'),        width: '140px',                                 sortType: 'text'   },
]

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
const jenisOptions = [
  { label: t('Output tax invoice'), value: 'output' },
  { label: t('Input tax invoice'),  value: 'input'  },
]

const statusLabel = computed(() => statusOptions.value.find(o => o.value === statusFilter.value)?.label ?? '')
const jenisLabel = computed(() => jenisOptions.find(o => o.value === jenisFilter.value)?.label ?? '')
const isDrawerFilterActive = computed(
  () => appliedFilters.periods.length > 0 || appliedFilters.withDifferenceOnly,
)
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

// ─── First-load skeleton ──────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// Column show/hide (first column always on)
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map(c => [c.key, true])),
)
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }
</script>

<template>
  <!-- US-016 — no index until setup is saved -->
  <div v-if="!isSetUp" class="vp-setup-gate">
    <div class="vp-setup-icon"><MpIcon name="sliders" size="32px" color="icon.information" /></div>
    <h2 class="vp-setup-title">{{ t('Set up VAT reconciliation') }}</h2>
    <p class="vp-setup-body">
      {{ t('Choose which tax codes count as PPN Keluaran. Reconciliation pulls sales invoices carrying those codes, and the journal entries posted to their accounts.') }}
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
    :context-label="(row) => `${t('Tax period')} ${row.masa} · ${row.jenis}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Quick filter 1 — Invoice type. Placeholder = the object name, real
             values only, (x) clears to show-all. -->
        <MpPopover id="vp-jenis-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="vp-jenis-select"
              :placeholder="t('Invoice type')"
              :model-value="jenisFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="jenisFilter = ''"
            >
              <option v-if="jenisFilter" :value="jenisFilter">{{ jenisLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in jenisOptions"
                :key="opt.value"
                :is-active="opt.value === jenisFilter"
                @click="jenisFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Quick filter 2 — Status. Options are scoped to the active tab. -->
        <MpPopover id="vp-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="vp-status-select"
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
                v-for="opt in statusOptions"
                :key="opt.value"
                :is-active="opt.value === statusFilter"
                @click="statusFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Everything past the two quick slots: masa pajak, has-a-difference. -->
        <button
          class="filter-all-btn"
          :class="{ 'filter-all-btn--active': isDrawerFilterActive }"
          @click="filtersOpen = true"
        >
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="vp-tt-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <MpIcon name="magic" size="md" />
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="vp-tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip id="vp-tt-export" :label="t('Export')" placement="bottom" use-portal>
            <button class="filter-icon-btn" :aria-label="t('Export')" @click="infoToast(t('Export started'))">
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            :placeholder="t('Search tax period')"
          />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="16px" />
          </button>
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
    <template #empty>
      <div class="vp-empty">
        <p class="vp-empty-title">{{ t('No tax periods') }}</p>
        <p class="vp-empty-desc">{{ t('Tax periods will appear here.') }}</p>
      </div>
    </template>

    <!-- ── Row action — download the reconciliation as CSV ── -->
    <template #actions="{ row }">
      <MpTooltip :id="`vp-tt-csv-${row.id}`" :label="t('Download CSV')" placement="bottom" use-portal>
        <button
          class="row-icon-btn"
          :aria-label="t('Download CSV')"
          @click.stop="infoToast(t('Export started'))"
        >
          <MpIcon name="download" size="sm" />
        </button>
      </MpTooltip>
    </template>
  </ErpTablePage>

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
  width: 64px;
  height: 64px;
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
/* Record count — a plain read-only tally, not a status, so it takes the neutral
   warning tint Klikpajak uses rather than a semantic badge type. */
.vp-count {
  order: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--mp-sizes-5, 20px);
  padding: 0 var(--mp-spacing-1\.5);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-colors-orange-100);
  color: var(--mp-colors-orange-800);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  font-variant-numeric: tabular-nums;
}

/* Palette tokens, since the semantic --mp-text-danger family is not emitted in
   this app (it resolves to nothing). Same red as MATCH_META. */
/* Overrides .cell-link's own colour — the selisih stays red as a link. */
.vp-selisih {
  color: var(--mp-colors-red-800);
  font-weight: var(--mp-font-weights-semi-bold);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  text-decoration: none;
}
.vp-selisih:hover { text-decoration: underline; }

.row-icon-btn {
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
.row-icon-btn:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* ── Empty state ────────────────────────────────────────────────────────── */
.vp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--mp-spacing-10) 0;
}
.vp-empty-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vp-empty-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--mp-text-secondary);
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
