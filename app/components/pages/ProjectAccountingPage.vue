<script setup lang="ts">
/**
 * Project accounting — the engagement portfolio (Accounting › Project accounting).
 *
 * This is a `pageRegistry` page: it renders INSIDE the shared `.stage`, which
 * already supplies the white surface + 24px padding, so the root adds neither.
 *
 * The table's job is to put the three ways of earning side by side — the point of
 * the module is that a project's recognition method is a property of the contract,
 * not a reporting preference, so it is shown on every row.
 */
import {
  MpBadge, MpButton, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon, MpSelect,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import {
  engagements, revenue, actualCost, billed, wipNet, lifecycleLabel,
  methodLabel, methodFormal, portfolioTotals, formatIdr,
  type Engagement, type RecognitionMethod,
} from '~/data/projectAccounting'

const router = useRouter()
const { t } = useLocale()

// ── Stats ─────────────────────────────────────────────────────────────────────
const totals = computed(() => portfolioTotals())
const stats = computed(() => [
  { key: 'revenue', label: t('Revenue recognised'), value: formatIdr(totals.value.revenue), sub: t('Across all projects'), adverse: false },
  { key: 'cost', label: t('Cost incurred'), value: formatIdr(totals.value.cost), sub: t('Across all projects'), adverse: false },
  { key: 'outstanding', label: t('Outstanding invoices'), value: formatIdr(totals.value.outstanding), sub: t('Issued, not yet collected'), adverse: totals.value.outstanding > 0 },
  { key: 'addenda', label: t('Contract addenda pending'), value: String(totals.value.pendingAddenda), sub: t('Must be settled before closure'), adverse: totals.value.pendingAddenda > 0 },
])

/**
 * Pixel has no purple badge, so Output by Milestone takes the neutral
 * `announcement` gray rather than the prototype's purple (DESIGN.md → MpBadge).
 */
const METHOD_BADGE: Record<RecognitionMethod, string> = {
  tm: 'information',
  input: 'completed',
  output: 'announcement',
}

// ── Rows ──────────────────────────────────────────────────────────────────────
interface Row extends Record<string, unknown> {
  id: string
  name: string
  meta: string
  method: RecognitionMethod
  methodName: string
  methodFormal: string
  revenueValue: number
  costValue: number
  budget: number | null
  spendPct: number | null
  billedValue: number
  wip: number
  statusLabel: string
}

const rows = computed<Row[]>(() => engagements.map((e: Engagement) => {
  const cost = actualCost(e)
  return {
    id: e.id,
    name: e.name,
    meta: `${e.client} · ${t('PM')} ${e.pm}`,
    method: e.method,
    methodName: methodLabel(e.method),
    methodFormal: methodFormal(e.method),
    revenueValue: revenue(e),
    costValue: cost,
    budget: e.budget,
    spendPct: e.budget ? (cost / e.budget) * 100 : null,
    billedValue: billed(e),
    wip: wipNet(e),
    statusLabel: lifecycleLabel(e.stage),
  }
}))

// Widths are tuned to fit a laptop viewport without horizontal scroll — scrolling
// the identity column off-screen loses which row you are reading.
const allCols: TableColumn[] = [
  { key: 'name', label: t('Project'), width: '250px', sortable: true, sortType: 'text' },
  { key: 'method', label: t('Revenue recognition'), width: '165px' },
  { key: 'revenueValue', label: t('Revenue recognised'), width: '150px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'spendPct', label: t('Budgeted / spent'), width: '185px', align: 'right' },
  { key: 'billedValue', label: t('Billed'), width: '135px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'wip', label: t('Billing progress'), width: '145px', align: 'right' },
  { key: 'statusLabel', label: t('Project status'), width: '120px', sortable: true, sortType: 'text' },
]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, true])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort, hasActiveSearch, hasActiveFilter,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    (!s || `${row.name} ${row.meta} ${row.methodName}`.toLowerCase().includes(s))
    && (!st || row.statusLabel === st),
})
sortKey.value = 'name'
sortDir.value = 'asc'

// Quick filter: placeholder IS the filter name, and show-all is not an option —
// clearing resets it (docs/patterns/Form.md → Select).
const statusOptions = computed(() => [...new Set(rows.value.map(r => r.statusLabel))].map(s => ({ value: s, label: s })))

function clearSearch() { search.value = '' }
function clearFilters() { statusFilter.value = '' }
function clearAll() { search.value = ''; statusFilter.value = '' }
function openEngagement(id: string) { router.push(`/project-accounting/${id}`) }

/** Spend bar turns amber past 85% of budget and red once it is through it. */
function spendTone(pct: number | null): string {
  if (pct === null) return 'none'
  if (pct > 100) return 'over'
  if (pct > 85) return 'near'
  return 'ok'
}
</script>

<template>
  <div class="pa-page">
    <!-- ── Portfolio stats ── -->
    <div class="pa-stats">
      <div v-for="s in stats" :key="s.key" class="pa-stat">
        <div class="pa-stat-label">{{ s.label }}</div>
        <div class="pa-stat-value" :class="{ 'pa-stat-value--adverse': s.adverse }">{{ s.value }}</div>
        <div class="pa-stat-sub">{{ s.sub }}</div>
      </div>
    </div>

    <ErpTablePage
      :columns="visibleColumns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :has-active-search="hasActiveSearch"
      :has-active-filter="hasActiveFilter"
      :search="search"
      bulk-label="project"
      filter-empty-label="project"
      is-row-clickable
      @row-click="openEngagement((($event as unknown) as Row).id)"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @hide-column="hideColumn"
      @clear-search="clearSearch"
      @clear-filters="clearFilters"
      @clear-all="clearAll"
    >
      <!-- ── Filter bar ── -->
      <template #filters>
        <div class="filter-left">
          <MpPopover id="pa-status-filter" is-close-on-select>
            <MpPopoverTrigger>
              <MpSelect
                id="pa-status-select"
                :placeholder="t('Status')"
                :model-value="statusFilter"
                is-clearable
                :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
                @mousedown.prevent
                @clear="statusFilter = ''"
              >
                <option v-if="statusFilter" :value="statusFilter">{{ statusFilter }}</option>
              </MpSelect>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
              <MpPopoverList>
                <MpPopoverListItem
                  v-for="opt in statusOptions"
                  :key="opt.value"
                  :is-active="opt.value === statusFilter"
                  @click="statusFilter = opt.value"
                >{{ opt.label }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>

          <MpButton class="filter-all-btn">
            <MpIcon name="filter" size="sm" />
            {{ t('All filters') }}
          </MpButton>
        </div>
        <div class="filter-right">
          <div class="filter-btn-group">
            <ColumnSettingsMenu id="pa-columns" :items="columnItems" :visibility="columnVisibility" />
          </div>
          <MpInputGroup id="pa-search" class="filter-search">
            <MpInputLeftAddon><MpIcon name="search" size="md" /></MpInputLeftAddon>
            <MpInput v-model="search" type="text" :placeholder="t('Search...')" />
          </MpInputGroup>
        </div>
      </template>

      <!-- ── Project ── -->
      <template #cell-name="{ row }">
        <a class="cell-link cell-text pa-name" @click.stop="openEngagement((row as unknown as Row).id)">
          {{ (row as unknown as Row).name }}
        </a>
        <div class="pa-sub">{{ (row as unknown as Row).meta }}</div>
      </template>

      <!-- ── Revenue recognition ── -->
      <template #cell-method="{ row }">
        <MpBadge for="additionalInformation" :type="METHOD_BADGE[(row as unknown as Row).method]" size="sm">
          {{ (row as unknown as Row).methodName }}
        </MpBadge>
        <div class="pa-sub">{{ (row as unknown as Row).methodFormal }}</div>
      </template>

      <!-- ── Revenue recognised ── -->
      <template #cell-revenueValue="{ row }">
        <span class="pa-num">{{ formatIdr((row as unknown as Row).revenueValue) }}</span>
      </template>

      <!-- ── Budgeted / spent ── -->
      <template #cell-spendPct="{ row }">
        <div class="pa-spend">
          <div class="pa-spend-top">
            <span class="pa-spend-pct" :data-tone="spendTone((row as unknown as Row).spendPct)">
              {{ (row as unknown as Row).spendPct === null ? '—' : `${Math.round((row as unknown as Row).spendPct as number)}%` }}
            </span>
            <span class="pa-sub">
              {{ (row as unknown as Row).budget === null
                ? t('no budget set')
                : ((row as unknown as Row).spendPct as number) > 100 ? t('over budget') : t('of budget incurred') }}
            </span>
          </div>
          <div class="pa-bar">
            <div
              class="pa-bar-fill"
              :data-tone="spendTone((row as unknown as Row).spendPct)"
              :style="{ width: `${Math.min(100, (row as unknown as Row).spendPct ?? 0)}%` }"
            />
          </div>
          <div class="pa-sub pa-num">
            {{ formatIdr((row as unknown as Row).costValue) }} {{ t('of') }}
            {{ (row as unknown as Row).budget === null ? '—' : formatIdr((row as unknown as Row).budget as number) }}
          </div>
        </div>
      </template>

      <!-- ── Billed ── -->
      <template #cell-billedValue="{ row }">
        <span class="pa-num">{{ formatIdr((row as unknown as Row).billedValue) }}</span>
      </template>

      <!-- ── Billing progress: unbilled (asset) vs overbilled (liability) ──
           Label over amount, so a long figure never clips at this width. -->
      <template #cell-wip="{ row }">
        <div
          class="pa-wip"
          :data-tone="Math.abs((row as unknown as Row).wip) < 1000 ? 'ok' : (row as unknown as Row).wip > 0 ? 'over' : 'near'"
        >
          <span class="pa-wip-label">
            {{ Math.abs((row as unknown as Row).wip) < 1000
              ? t('Billing matched')
              : (row as unknown as Row).wip > 0 ? t('Unbilled') : t('Overbilled') }}
          </span>
          <span v-if="Math.abs((row as unknown as Row).wip) >= 1000" class="pa-num pa-wip-amount">
            {{ formatIdr(Math.abs((row as unknown as Row).wip)) }}
          </span>
        </div>
      </template>

      <!-- ── Project status ── -->
      <template #cell-statusLabel="{ row }">
        <ErpStatusBadge :status="(row as unknown as Row).statusLabel" />
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No projects yet') }}</p>
          <p class="empty-full-desc">{{ t('An engagement letter, SOW or sales order becomes a tracked project here.') }}</p>
          <button
            type="button"
            class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before"
            @click="router.push('/project-accounting/new')"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('New engagement') }}
          </button>
        </div>
      </template>
    </ErpTablePage>
  </div>
</template>

<style scoped>
/* Root adds no padding/background — the shared `.stage` already supplies both. */
.pa-page { display: flex; flex-direction: column; gap: var(--mp-spacing-5); min-height: 0; }

/* ── Stat cards — separated by a border, never a drop-shadow (DESIGN.md) ───── */
.pa-stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--mp-spacing-3);
}
.pa-stat {
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
  background: var(--mp-background-neutral); padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.pa-stat-label {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-1\.5, 6px);
}
.pa-stat-value {
  font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.pa-stat-value--adverse { color: var(--mp-text-danger, #a8352d); }
.pa-stat-sub { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); margin-top: 2px; }

/* ── Cells ─────────────────────────────────────────────────────────────────── */
.pa-name { text-align: left; font-weight: var(--mp-font-weights-semi-bold); white-space: normal; }
.pa-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: 2px; }
.pa-num { font-variant-numeric: tabular-nums; }

.pa-spend { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-1); }
.pa-spend-top { display: flex; align-items: baseline; gap: var(--mp-spacing-1\.5, 6px); }
.pa-spend-pct { font-weight: var(--mp-font-weights-semi-bold); font-variant-numeric: tabular-nums; }
.pa-spend-pct[data-tone='ok'] { color: var(--mp-text-success, #028454); }
.pa-spend-pct[data-tone='near'] { color: var(--mp-text-warning, #e46910); }
.pa-spend-pct[data-tone='over'] { color: var(--mp-text-danger, #a8352d); }
.pa-spend-pct[data-tone='none'] { color: var(--mp-text-secondary); }

.pa-bar { width: 150px; height: 6px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); overflow: hidden; }
.pa-bar-fill { height: 100%; border-radius: var(--mp-radii-full, 999px); }
.pa-bar-fill[data-tone='ok'] { background: var(--mp-colors-emerald-700, #029861); }
.pa-bar-fill[data-tone='near'] { background: var(--mp-colors-orange-600, #e46910); }
.pa-bar-fill[data-tone='over'] { background: var(--mp-colors-red-700, #a8352d); }
.pa-bar-fill[data-tone='none'] { background: var(--mp-border-bold); }

.pa-wip { display: flex; flex-direction: column; align-items: flex-end; font-size: var(--mp-font-sizes-sm); }
.pa-wip-label { font-weight: var(--mp-font-weights-semi-bold); }
.pa-wip-amount { font-weight: var(--mp-font-weights-semi-bold); }
.pa-wip[data-tone='ok'] { color: var(--mp-text-success, #028454); }
.pa-wip[data-tone='near'] { color: var(--mp-text-warning, #e46910); }
.pa-wip[data-tone='over'] { color: var(--mp-text-danger, #a8352d); }

/* ── Filter bar — each index page defines these itself (they are page-scoped,
      not global), so omitting them leaves the bar with no layout at all. ─────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-2); }
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
  color: var(--mp-text-secondary) !important;
  cursor: pointer;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
</style>
