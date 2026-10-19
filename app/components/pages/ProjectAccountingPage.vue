<script setup lang="ts">
/**
 * Project accounting: the project list (Accounting › Project accounting).
 *
 * A `pageRegistry` page: it renders INSIDE the shared `.stage`, which already
 * supplies the white surface + 24px padding, so the root adds neither.
 * Structure copied from BillsIndexPage: stats band, ErpFilterSelect + All filters
 * drawer, pill search, checkbox bulk bar, first-load skeleton, ScenarioFab.
 */
import {
  MpBadge, MpButton, MpIcon, MpButtonGroup, MpTooltip,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ProjectStatCards, { type ProjectStat } from '~/components/patterns/ProjectStatCards.vue'
import ProjectFiltersDrawer, {
  emptyProjectFilters, countProjectFilters, type ProjectFiltersValue, type ProjectFilterKey,
} from '~/components/patterns/ProjectFiltersDrawer.vue'
import {
  engagements, revenue, actualCost, billed, wipNet, daysAgo, pendingVos,
  methodLabel, methodFormal, portfolioTotals, formatIdr, canDecide,
  projectStatusKey, projectStatusLabel,
  type Engagement, type RecognitionMethod, type ProjectStatusKey,
} from '~/data/projectAccounting'
import { successToast } from '~/utils/toasts'
import { useProjectViewAs, PROJECT_VIEW_AS_USERS, type ProjectViewAs } from '~/composables/useProjectViewAs'

const router = useRouter()
const { t } = useLocale()
const { viewAs, setViewAs, currentUser } = useProjectViewAs()

// ── Prototype controls ────────────────────────────────────────────────────────
// First-load skeleton (rule/index-first-load-skeleton).
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 500) })

// ScenarioFab: Default / Empty state, then the simulated "View as" personas.
const previewMode = ref<'data' | 'empty'>('data')
const VIEW_AS_ROLE: Record<ProjectViewAs, string> = { pm: 'Project manager', approver: 'Approver' }
const scenarios = computed(() => [
  { value: 'data', label: t('Default') },
  { value: 'empty', label: t('Empty state') },
  { value: '__view-as', label: `${t('View as')} · ${t('Simulated for this prototype')}` },
  ...(Object.keys(PROJECT_VIEW_AS_USERS) as ProjectViewAs[]).map((k) => {
    const u = PROJECT_VIEW_AS_USERS[k]
    const role = k === 'approver' ? `${t(VIEW_AS_ROLE[k])}, ${u.role}` : t(VIEW_AS_ROLE[k])
    return { value: `as-${k}`, label: `${viewAs.value === k ? '✓' : '   '} ${u.name} (${role})` }
  }),
])
const scenario = computed({
  get: () => previewMode.value as string,
  set: (v: string) => {
    if (v.startsWith('as-')) setViewAs(v.slice(3) as ProjectViewAs)
    else if (v === 'data' || v === 'empty') previewMode.value = v
  },
})

// ── Rows ──────────────────────────────────────────────────────────────────────
type BillingKey = 'uptodate' | 'unbilled' | 'advance'
type BudgetKey = 'over' | 'near' | 'ok' | 'none'

interface Row extends Record<string, unknown> {
  id: string
  name: string
  customer: string
  pm: string
  meta: string
  method: RecognitionMethod
  methodName: string
  methodFormal: string
  revenueValue: number
  costValue: number
  budget: number | null
  /** Sort value: % of budget spent; -1 when there is no budget. */
  spendPct: number
  budgetKey: BudgetKey
  billedValue: number
  /** Signed billing position: + unbilled revenue, − billed in advance. */
  wip: number
  billingKey: BillingKey
  /** Days since the oldest unbilled item, when derivable; null otherwise. */
  unbilledAge: number | null
  unpaidCount: number
  pendingAddenda: number
  statusKey: ProjectStatusKey
  statusLabel: string
}

/** Unbilled revenue past this age turns red; younger unbilled work is normal WIP. */
const UNBILLED_AGE_LIMIT = 60

/**
 * Age of the oldest item behind the unbilled position. Cost plus margin: cost
 * lines not yet invoiced. Milestones: verified, not yet invoiced. Percentage of
 * completion has no per-item date, so it stays neutral (null).
 */
function oldestUnbilledAge(e: Engagement): number | null {
  const dates: string[] = []
  if (e.method === 'tm') {
    e.entries.filter(x => x.decision !== 'absorb' && !x.invoiced).forEach(x => dates.push(x.date))
  }
  else if (e.method === 'output') {
    (e.milestones ?? []).filter(m => m.verified && !m.invId && m.verifiedAt).forEach(m => dates.push(m.verifiedAt as string))
  }
  if (!dates.length) return null
  return Math.max(...dates.map(d => daysAgo(d)))
}

function budgetKeyOf(pct: number | null): BudgetKey {
  if (pct === null) return 'none'
  if (pct > 100) return 'over'
  if (pct > 85) return 'near'
  return 'ok'
}

const allRows = computed<Row[]>(() => engagements.map((e: Engagement) => {
  const cost = actualCost(e)
  const pct = e.budget ? (cost / e.budget) * 100 : null
  const wip = wipNet(e)
  const billingKey: BillingKey = Math.abs(wip) < 1000 ? 'uptodate' : wip > 0 ? 'unbilled' : 'advance'
  return {
    id: e.id,
    name: e.name,
    customer: e.client,
    pm: e.pm,
    meta: `${e.client} · ${e.pm}`,
    method: e.method,
    methodName: methodLabel(e.method),
    methodFormal: methodFormal(e.method),
    revenueValue: revenue(e),
    costValue: cost,
    budget: e.budget,
    spendPct: pct ?? -1,
    budgetKey: budgetKeyOf(pct),
    billedValue: billed(e),
    wip,
    billingKey,
    unbilledAge: billingKey === 'unbilled' ? oldestUnbilledAge(e) : null,
    unpaidCount: e.invoices.filter(i => i.status === 'unpaid').length,
    pendingAddenda: pendingVos(e).length,
    statusKey: projectStatusKey(e),
    statusLabel: projectStatusLabel(e),
  }
}))
const rows = computed<Row[]>(() => (previewMode.value === 'empty' ? [] : allRows.value))

// ── Stats ─────────────────────────────────────────────────────────────────────
const totals = computed(() => portfolioTotals())
const unpaidProjects = computed(() => allRows.value.filter(r => r.unpaidCount > 0).length)
const addendaProjects = computed(() => allRows.value.filter(r => r.pendingAddenda > 0).length)
/** Addendum requests the current (simulated) user can decide. */
const addendaForMe = computed(() => engagements
  .flatMap(e => (e.approvals ?? []).filter(a => a.action === 'addendum'))
  .filter(a => canDecide(a, currentUser.value.name).ok).length)

function projectsLabel(n: number): string { return `${n} ${t(n === 1 ? 'project' : 'projects')}` }

const stats = computed<ProjectStat[]>(() => {
  const n = totals.value.pendingAddenda
  return [
    { key: 'revenue', label: t('Revenue recognized'), sub: t('All projects, to date'), value: formatIdr(totals.value.revenue) },
    { key: 'cost', label: t('Cost incurred'), sub: t('All projects, to date'), value: formatIdr(totals.value.cost) },
    {
      key: 'unpaid', label: t('Unpaid invoices'), sub: t('Sent, awaiting payment'), value: formatIdr(totals.value.outstanding),
      link: unpaidProjects.value ? projectsLabel(unpaidProjects.value) : undefined,
    },
    {
      key: 'addenda', label: t('Addenda awaiting approval'),
      sub: n === 0 ? t('None pending') : addendaForMe.value ? `${addendaForMe.value} ${t('waiting for you')}` : t('Blocks project closing'),
      value: String(n),
      link: addendaProjects.value ? projectsLabel(addendaProjects.value) : undefined,
    },
  ]
})

// ── Columns ───────────────────────────────────────────────────────────────────
// Widths come from `kind` (columnWidths.ts). Billed stays in column settings but
// is hidden by default: Billing position already carries it, and seven columns
// do not fit a 1440 stage without horizontal scroll.
const allCols: TableColumn[] = [
  { key: 'name', label: t('Project'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'methodName', label: t('Method'), kind: 'default', sortable: true, sortType: 'text' },
  { key: 'revenueValue', label: t('Revenue recognized'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'spendPct', label: t('Budget spent'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'billedValue', label: t('Billed'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'wip', label: t('Billing position'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'statusLabel', label: t('Status'), kind: 'status', sortable: true, sortType: 'text' },
]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'billedValue'])))
// Six columns at their `kind` minimums need ~1010px; a 1280 stage gives 988. Below
// 1400px the Method column starts hidden (still in column settings, still in
// All filters), so the figures never scroll off.
onMounted(() => { if (window.innerWidth < 1400) columnVisibility.methodName = false })
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ── All filters drawer ────────────────────────────────────────────────────────
const filtersOpen = ref(false)
const appliedFilters = reactive<ProjectFiltersValue>(emptyProjectFilters())
function applyDrawerFilters(v: ProjectFiltersValue) { Object.assign(appliedFilters, v) }

const BUDGET_LABEL: Record<Exclude<BudgetKey, 'ok'>, string> = { over: 'Over budget', near: 'Near budget (over 85%)', none: 'No budget' }
const BILLING_LABEL: Record<BillingKey, string> = { uptodate: 'Up to date', unbilled: 'Unbilled', advance: 'Billed in advance' }

function uniq(vals: string[]): { value: string; label: string }[] {
  return [...new Set(vals)].sort((a, b) => a.localeCompare(b)).map(v => ({ value: v, label: v }))
}
const drawerOptions = computed<Record<ProjectFilterKey, { value: string; label: string }[]>>(() => ({
  method: (['tm', 'input', 'output'] as RecognitionMethod[]).map(m => ({ value: m, label: methodLabel(m) })),
  pm: uniq(allRows.value.map(r => r.pm)),
  customer: uniq(allRows.value.map(r => r.customer)),
  budget: (Object.keys(BUDGET_LABEL) as (keyof typeof BUDGET_LABEL)[]).map(k => ({ value: k, label: t(BUDGET_LABEL[k]) })),
  billing: (Object.keys(BILLING_LABEL) as BillingKey[]).map(k => ({ value: k, label: t(BILLING_LABEL[k]) })),
  status: uniq(allRows.value.map(r => r.statusLabel)),
}))

// Stat-link drill-downs: narrow the table to what the figure describes.
type Drill = '' | 'unpaid' | 'addenda'
const drill = ref<Drill>('')
const DRILL_LABEL: Record<Exclude<Drill, ''>, string> = { unpaid: 'With unpaid invoices', addenda: 'With an addendum awaiting approval' }

function matchesDrawer(row: Row): boolean {
  const f = appliedFilters
  return (!f.method.length || f.method.includes(row.method))
    && (!f.pm.length || f.pm.includes(row.pm))
    && (!f.customer.length || f.customer.includes(row.customer))
    && (!f.budget.length || f.budget.includes(row.budgetKey))
    && (!f.billing.length || f.billing.includes(row.billingKey))
    && (!f.status.length || f.status.includes(row.statusLabel))
}

// ── Table state ───────────────────────────────────────────────────────────────
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort, toggleSort, hasActiveSearch,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    (!s || `${row.name} ${row.meta} ${row.methodName}`.toLowerCase().includes(s))
    && (!st || row.statusLabel === st)
    && matchesDrawer(row)
    && (drill.value !== 'unpaid' || row.unpaidCount > 0)
    && (drill.value !== 'addenda' || row.pendingAddenda > 0),
})
sortKey.value = 'name'
sortDir.value = 'asc'
watch([appliedFilters, drill], () => setPage(1))

function onStatLink(key: string) {
  if (key === 'unpaid' || key === 'addenda') drill.value = key
}

const statusOptions = computed(() => uniq(allRows.value.map(r => r.statusLabel)))
const activeFilterCount = computed(() => countProjectFilters(appliedFilters))
const isFiltered = computed(() => !!statusFilter.value || activeFilterCount.value > 0 || !!drill.value)
const hasActiveFilter = computed(() => hasActiveSearch.value || isFiltered.value)

function clearFilters() {
  statusFilter.value = ''
  drill.value = ''
  Object.assign(appliedFilters, emptyProjectFilters())
}
function clearAll() { search.value = ''; clearFilters() }
function openProject(id: string) { router.push(`/project-accounting/${id}`) }

// ── Bulk export: a real CSV of the selected rows ──────────────────────────────
function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function exportSelected(selectedRows: Set<number>, deselectAll: () => void) {
  const picked = [...selectedRows].map(i => paginated.value[i] as Row).filter(Boolean)
  if (!picked.length) return
  const header = ['Project', 'Customer', 'Project manager', 'Method', 'Revenue recognized', 'Cost incurred', 'Budget', 'Budget spent %', 'Billed', 'Billing position', 'Billing position amount', 'Status']
  const lines = picked.map(r => [
    r.name, r.customer, r.pm, r.methodName, Math.round(r.revenueValue), Math.round(r.costValue),
    r.budget === null ? '' : Math.round(r.budget), r.budget === null ? '' : Math.round(r.spendPct),
    Math.round(r.billedValue), BILLING_LABEL[r.billingKey], Math.round(r.wip), r.statusLabel,
  ].map(csvCell).join(','))
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `projects-${picked.length}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  successToast(`${t('Exported')} ${projectsLabel(picked.length)}`)
  deselectAll()
}

// ── Cell helpers ──────────────────────────────────────────────────────────────
function asRow(r: unknown): Row { return r as Row }
function spendCaption(r: Row): string {
  // Non-breaking spaces keep "spent" with its figure and "· No budget" together.
  if (r.budget === null) return `${formatIdr(r.costValue)}\u00A0${t('spent')} ·\u00A0${t('No budget').replace(/ /g, '\u00A0')}`
  return `${formatIdr(r.costValue)} ${t('of')} ${formatIdr(r.budget)}`
}
/** Neutral by default; billed in advance is info; red only past the age limit. */
function billingTone(r: Row): 'neutral' | 'info' | 'late' {
  if (r.billingKey === 'advance') return 'info'
  if (r.billingKey === 'unbilled' && (r.unbilledAge ?? 0) > UNBILLED_AGE_LIMIT) return 'late'
  return 'neutral'
}
function statusBadgeType(r: Row): 'warning' | 'information' | 'announcement' {
  return r.statusKey === 'pending approval' ? 'warning' : r.statusKey === 'closed' ? 'announcement' : 'information'
}
</script>

<template>
  <div class="pa-page">
    <ErpTablePage
      data-tour="pa-portfolio"
      :columns="visibleColumns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :loading="loading"
      has-checkbox
      :has-active-search="hasActiveSearch"
      :has-active-filter="hasActiveFilter"
      :search="search"
      bulk-label="project"
      filter-empty-label="project"
      is-row-clickable
      @row-click="openProject(asRow($event).id)"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort="toggleSort"
      @sort-change="setSort"
      @hide-column="hideColumn"
      @clear-search="search = ''"
      @clear-filters="clearAll"
      @clear-all="clearAll"
    >
      <!-- ── Bulk actions ── -->
      <template #bulk-actions="{ selectedRows, deselectAll }">
        <MpButton
          size="sm" variant="secondary" is-rounded
          @click="exportSelected(selectedRows as Set<number>, deselectAll as () => void)"
        >{{ t('Export') }}</MpButton>
      </template>

      <!-- ── Stats ── -->
      <template #stats>
        <ProjectStatCards data-tour="pa-portfolio-stats" :stats="stats" @link="onStatLink" />
      </template>

      <!-- ── Filter bar ── -->
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="pa-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
          <MpButton class="filter-all-btn" :class="{ 'filter-all-btn--active': activeFilterCount > 0 }" @click="filtersOpen = true">
            <MpIcon name="filter" size="sm" />
            {{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}
          </MpButton>
          <span v-if="drill" class="pa-drill">{{ t(DRILL_LABEL[drill]) }}</span>
          <MpButton v-if="isFiltered" variant="ghost" is-rounded @click="clearFilters">{{ t('Clear filters') }}</MpButton>
        </div>
        <div class="filter-right">
          <MpButtonGroup class="filter-btn-group">
            <ColumnSettingsMenu id="pa-columns" :items="columnItems" :visibility="columnVisibility" />
          </MpButtonGroup>
          <!-- Pill search (sanctioned filter-bar pill, copied from BillsIndexPage) -->
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
              <MpIcon name="close" size="sm" />
            </button>
          </div>
        </div>
      </template>

      <!-- ── Project ── -->
      <template #cell-name="{ row }">
        <div class="pa-cell">
          <a class="cell-link cell-text pa-name" :title="asRow(row).name" @click.stop="openProject(asRow(row).id)">{{ asRow(row).name }}</a>
          <div class="pa-sub pa-trunc" :title="asRow(row).meta">{{ asRow(row).meta }}</div>
        </div>
      </template>

      <!-- ── Method: one neutral badge; the tooltip carries the meaning ── -->
      <template #cell-methodName="{ row }">
        <MpTooltip :label="asRow(row).methodFormal" placement="top">
          <MpBadge for="tableStatus" type="announcement">{{ asRow(row).methodName }}</MpBadge>
        </MpTooltip>
      </template>

      <!-- ── Revenue recognized ── -->
      <template #cell-revenueValue="{ row }">
        <span class="pa-num">{{ formatIdr(asRow(row).revenueValue) }}</span>
      </template>

      <!-- ── Budget spent ── -->
      <template #cell-spendPct="{ row }">
        <div class="pa-spend">
          <span v-if="asRow(row).budget !== null" class="pa-spend-pct" :data-tone="asRow(row).budgetKey">
            {{ Math.round(asRow(row).spendPct) }}%<template v-if="asRow(row).budgetKey === 'over'"> · {{ t('Over budget') }}</template>
          </span>
          <div v-if="asRow(row).budget !== null" class="pa-bar">
            <div class="pa-bar-fill" :data-tone="asRow(row).budgetKey" :style="{ width: `${Math.min(100, asRow(row).spendPct)}%` }" />
          </div>
          <div class="pa-sub pa-num pa-spend-cap">{{ spendCaption(asRow(row)) }}</div>
        </div>
      </template>

      <!-- ── Billed ── -->
      <template #cell-billedValue="{ row }">
        <span class="pa-num">{{ formatIdr(asRow(row).billedValue) }}</span>
      </template>

      <!-- ── Billing position ── -->
      <template #cell-wip="{ row }">
        <div class="pa-wip" :data-tone="billingTone(asRow(row))">
          <span class="pa-wip-label">{{ t(BILLING_LABEL[asRow(row).billingKey]) }}<template v-if="billingTone(asRow(row)) === 'late'"> · {{ asRow(row).unbilledAge }} {{ t('days') }}</template></span>
          <span v-if="asRow(row).billingKey !== 'uptodate'" class="pa-num pa-wip-amount">{{ formatIdr(Math.abs(asRow(row).wip)) }}</span>
        </div>
      </template>

      <!-- ── Status ── -->
      <template #cell-statusLabel="{ row }">
        <ErpStatusBadge :status="asRow(row).statusKey" :label="asRow(row).statusLabel" :type="statusBadgeType(asRow(row))" />
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No projects') }}</p>
          <p class="empty-full-desc">{{ t('Projects will appear here.') }}</p>
          <MpButton class="pa-empty-cta" variant="primary" is-rounded left-icon="add" @click="router.push('/project-accounting/new')">{{ t('New project') }}</MpButton>
        </div>
      </template>
    </ErpTablePage>

    <ProjectFiltersDrawer
      id="pa-allfilters"
      :is-open="filtersOpen"
      :model-value="appliedFilters"
      :options="drawerOptions"
      @update:is-open="filtersOpen = $event"
      @apply="applyDrawerFilters"
    />

    <!-- Prototype scenario FAB: Default / Empty state, and the simulated View as. -->
    <ScenarioFab v-model="scenario" :scenarios="scenarios" />
  </div>
</template>

<style scoped>
/* Root adds no padding/background — the shared `.stage` already supplies both. */
.pa-page { display: flex; flex-direction: column; min-height: 0; }

/* ── Cells ─────────────────────────────────────────────────────────────────── */
.pa-cell { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.pa-name {
  display: block; max-width: 100%;
  text-align: left; font-weight: var(--mp-font-weights-semi-bold);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pa-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-0\.5); }
.pa-trunc { display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pa-num { font-variant-numeric: tabular-nums; }
/* Wraps at "of" rather than clipping the budget figure. */
.pa-spend-cap { text-align: right; white-space: normal; }

.pa-spend { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-1); min-width: 0; }
.pa-spend-pct { font-weight: var(--mp-font-weights-semi-bold); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pa-spend-pct[data-tone='ok'] { color: var(--mp-text-default); }
.pa-spend-pct[data-tone='near'] { color: var(--mp-colors-text-warning); }
.pa-spend-pct[data-tone='over'] { color: var(--mp-text-danger); }
.pa-spend-pct[data-tone='none'] { color: var(--mp-text-secondary); font-weight: var(--mp-font-weights-regular); }

/* 6px rail: bar heights have no token (accepted no-token exception). */
.pa-bar { flex: none; width: 100%; height: 6px; border-radius: var(--mp-radii-full); background: var(--mp-background-neutral-subtle); overflow: hidden; }
.pa-bar-fill { height: 100%; border-radius: var(--mp-radii-full); }
.pa-bar-fill[data-tone='ok'] { background: var(--mp-colors-background-success-bold); }
.pa-bar-fill[data-tone='near'] { background: var(--mp-colors-orange-600); }
.pa-bar-fill[data-tone='over'] { background: var(--mp-colors-red-700); }

.pa-wip { display: flex; flex-direction: column; align-items: flex-end; }
.pa-wip-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.pa-wip-amount { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pa-wip[data-tone='info'] .pa-wip-label { color: var(--mp-text-link); }
.pa-wip[data-tone='late'] .pa-wip-label,
.pa-wip[data-tone='late'] .pa-wip-amount { color: var(--mp-text-danger); }

.pa-drill {
  display: inline-flex; align-items: center; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
}

.pa-empty-cta { margin-top: var(--mp-spacing-4); }

/* ── Filter bar — page-scoped, copied from BillsIndexPage. ─────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); min-width: 0; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-all-btn {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary) !important;
  cursor: pointer;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.filter-all-btn--active {
  background: var(--mp-background-neutral-subtle) !important;
  border-color: var(--mp-colors-border-bold) !important;
  color: var(--mp-text-link) !important;
}

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: var(--mp-sizes-5); height: var(--mp-sizes-5); padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-colors-icon-default);
  border-radius: var(--mp-radii-full);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
