<script setup lang="ts">
/**
 * Projects — the MTO portfolio index (PRD §"Portfolio", Story 15).
 *
 * "So a loss-making job can never run unnoticed": one list carrying cost,
 * billing and exposure together. Both project shapes — a full production job and
 * a depth-1 service engagement — appear here with the same columns and the same
 * `PS-` series (Story 1); nothing about this page branches on shape.
 *
 * Two deliberate departures from a generic index page:
 *   • Drill-in lands on the project's BUDGET tab, not its structure. The PRD is
 *     explicit: "rather than a numberless accordion".
 *   • No row checkboxes. There is no batch operation on a project, and
 *     rule/table-checkbox-implies-bulk forbids a checkbox with nothing to do.
 */
import {
  MpButton, MpButtonGroup, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, MpBadge, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ProjectFiltersDrawer, {
  emptyProjectFilters, type ProjectFiltersValue,
} from '~/components/patterns/ProjectFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import {
  projects, methodLabel, SHAPE_LABEL, projectCommitted, projectActual,
  projectPercentComplete, projectWip, isOverBudget,
  type Project, type ProjectStatus,
} from '~/data/projects'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const router = useRouter()

// ─── Columns ──────────────────────────────────────────────────────────────────
// Widths come from each column's semantic `kind` (rule/table-column-kind) — no
// pixel widths on a name/amount/status column.
const columns: TableColumn[] = [
  { key: 'number',        label: t('Project number'),   kind: 'number', sortable: true, sortType: 'text'   },
  { key: 'name',          label: t('Project name'),     kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'shape',         label: t('Shape')                                                               },
  { key: 'method',        label: t('Recognition')                                                         },
  { key: 'status',        label: t('Status'),           kind: 'status', sortType: 'text'                   },
  { key: 'budget',        label: t('Budget'),           kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'committed',     label: t('Committed'),        kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'actual',        label: t('Actual'),           kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'percent',       label: t('% complete'),       align: 'right',                 sortType: 'number' },
  { key: 'billed',        label: t('Billed'),           kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'wip',           label: t('WIP position'),     kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'exposure',      label: t('Change order exposure'), kind: 'amount', align: 'right', sortType: 'number' },
]

// ─── Rows ─────────────────────────────────────────────────────────────────────
// Roll-ups are computed from the work packages (see projects.ts) rather than
// stored, so a portfolio figure can never disagree with the structure beneath it.
type Row = Project & {
  shapeLabel: string
  methodText: string
  committed: number
  actual: number
  percent: number | null
  wip: number | null
  exposure: number
  overBudget: boolean
}

const previewMode = ref<'data' | 'empty'>('data')

const rows = computed<Row[]>(() =>
  previewMode.value === 'empty'
    ? []
    : projects.map(p => ({
      ...p,
      shapeLabel: t(SHAPE_LABEL[p.shape]),
      methodText: methodLabel(p),
      committed: projectCommitted(p),
      actual: projectActual(p),
      percent: projectPercentComplete(p),
      wip: projectWip(p),
      exposure: p.changeOrderExposure,
      overBudget: isOverBudget(p),
    })),
)

// ─── Quick filters (max 2 — index-page-format §A.3) ───────────────────────────
const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'draft',  label: t('Draft')  },
  { value: 'active', label: t('Active') },
  { value: 'closed', label: t('Closed') },
]
const SHAPE_OPTIONS = [
  { value: 'production', label: t('Production') },
  { value: 'service',    label: t('Service')    },
]
const statusFilter = ref('')
const shapeFilter = ref('')

// ─── All filters drawer — recognition method + the four reporting dimensions ──
// Dimensions are actual-side reporting only; there is no dimension-level budget
// (PRD §9), so they filter the list and nothing else.
const filtersOpen = ref(false)
const appliedFilters = reactive<ProjectFiltersValue>(emptyProjectFilters())
function applyFilters(v: ProjectFiltersValue) { Object.assign(appliedFilters, v) }

const activeFilterCount = computed(() =>
  (appliedFilters.method ? 1 : 0)
  + (appliedFilters.branch ? 1 : 0)
  + (appliedFilters.department ? 1 : 0)
  + (appliedFilters.costCenter ? 1 : 0)
  + (appliedFilters.fundingSource ? 1 : 0)
  + (appliedFilters.overBudgetOnly ? 1 : 0),
)

// ─── Table state ──────────────────────────────────────────────────────────────
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.number.toLowerCase().includes(s)
      || row.name.toLowerCase().includes(s)
      || row.customerName.toLowerCase().includes(s)
      || row.pmOwner.toLowerCase().includes(s)
    const matchesStatus = !statusFilter.value || row.status === statusFilter.value
    const matchesShape = !shapeFilter.value || row.shape === shapeFilter.value
    const matchesMethod = !appliedFilters.method || row.method === appliedFilters.method
    const matchesOverBudget = !appliedFilters.overBudgetOnly || row.overBudget
    return matchesSearch && matchesStatus && matchesShape && matchesMethod && matchesOverBudget
  },
})

watch([statusFilter, shapeFilter, appliedFilters], () => setPage(1))

const hasActiveFilter = computed(() =>
  !!search.value || !!statusFilter.value || !!shapeFilter.value || activeFilterCount.value > 0,
)
function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  shapeFilter.value = ''
  Object.assign(appliedFilters, emptyProjectFilters())
}

// ─── Column show/hide ─────────────────────────────────────────────────────────
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map(c => [c.key, true])),
)
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))

// ─── Formatters ───────────────────────────────────────────────────────────────
/** A missing budget renders "Not set" — never Rp 0 (Story 2). */
function money(v: number | undefined): string {
  return v === undefined ? t('Not set') : formatIDR(v)
}
/** T&M has no % complete, and a missing denominator has none either — "—", not 0%. */
function percent(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}%`
}
/**
 * WIP is signed and the sign carries the meaning:
 *   positive → underbilled (contract asset) · negative → overbilled (liability)
 * so the tooltip names the position rather than leaving the reader to infer it.
 */
function wipLabel(v: number | null): string {
  if (v === null) return '—'
  if (v === 0) return formatIDR(0)
  return `${v > 0 ? '+' : ''}${formatIDR(v)}`
}
function wipTitle(v: number | null): string {
  if (v === null || v === 0) return ''
  return v > 0 ? t('Underbilled — contract asset') : t('Overbilled — contract liability')
}

// ─── First-load skeleton (rule/index-first-load-skeleton) ─────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 900) })

/** Drill-in lands on the Budget tab, per Story 15 — never the bare structure. */
function viewBudget(row: Row) { router.push(`/projects/${row.id}?tab=budget`) }
function viewStructure(row: Row) { router.push(`/projects/${row.id}?tab=structure`) }

const emptyIllustration = '/illustrations/empty-folder.png'
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
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    :search="search"
    filter-empty-label="project"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="pr-status" v-model="statusFilter" :placeholder="t('Status')" :options="STATUS_OPTIONS" />
        <ErpFilterSelect id="pr-shape" v-model="shapeFilter" :placeholder="t('Shape')" :options="SHAPE_OPTIONS" />
        <MpButton
          variant="secondary" left-icon="filter" is-rounded class="filter-all-btn"
          :class="{ 'filter-all-btn--active': activeFilterCount > 0 }"
          @click="filtersOpen = true"
        >{{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}</MpButton>
      </div>

      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="pr-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded />
          </MpTooltip>
        </MpButtonGroup>

        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" >
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <!-- ── Project number — the identity cell, links to the record ── -->
    <template #cell-number="{ row }">
      <span class="cell-link" @click.stop="viewBudget(row as unknown as Row)">{{ (row as unknown as Row).number }}</span>
    </template>

    <!-- ── Name + customer. The customer is the second line: a project is only
           legible with the job it belongs to. ── -->
    <template #cell-name="{ row }">
      <div class="pr-name">
        <span
          class="cell-link pr-name-main"
          :title="(row as unknown as Row).name"
          @click.stop="viewBudget(row as unknown as Row)"
        >{{ (row as unknown as Row).name }}</span>
        <span class="pr-sub">{{ (row as unknown as Row).customerName }}</span>
      </div>
    </template>

    <template #cell-shape="{ row }">{{ (row as unknown as Row).shapeLabel }}</template>
    <template #cell-method="{ row }">{{ (row as unknown as Row).methodText }}</template>

    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as unknown as Row).status" />
    </template>

    <!-- ── Budget — carries the over-budget flag, because that is the number the
           flag is about. A separate flag column would sit far from its cause. ── -->
    <template #cell-budget="{ row }">
      <div class="pr-amount-cell">
        <span :class="{ 'pr-notset': (row as unknown as Row).budget === undefined }">
          {{ money((row as unknown as Row).budget) }}
        </span>
        <MpBadge v-if="(row as unknown as Row).overBudget" for="tableStatus" type="critical">{{ t('Over budget') }}</MpBadge>
      </div>
    </template>

    <template #cell-committed="{ row }">{{ formatIDR((row as unknown as Row).committed) }}</template>
    <template #cell-actual="{ row }">{{ formatIDR((row as unknown as Row).actual) }}</template>
    <template #cell-percent="{ row }">{{ percent((row as unknown as Row).percent) }}</template>
    <template #cell-billed="{ row }">{{ formatIDR((row as unknown as Row).billed) }}</template>

    <template #cell-wip="{ row }">
      <span
        :class="{
          'pr-wip--asset': ((row as unknown as Row).wip ?? 0) > 0,
          'pr-wip--liability': ((row as unknown as Row).wip ?? 0) < 0,
        }"
        :title="wipTitle((row as unknown as Row).wip)"
      >{{ wipLabel((row as unknown as Row).wip) }}</span>
    </template>

    <template #cell-exposure="{ row }">
      <span :class="{ 'pr-exposure': (row as unknown as Row).exposure > 0 }">
        {{ (row as unknown as Row).exposure > 0 ? formatIDR((row as unknown as Row).exposure) : '—' }}
      </span>
    </template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pr-actions-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu" :class="css({ width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewBudget(row as unknown as Row)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="viewStructure(row as unknown as Row)">{{ t('View structure') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Empty state — no projects have ever been created ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" >
        <p class="empty-full-title">{{ t('No projects') }}</p>
        <p class="empty-full-desc">{{ t('Projects will appear here.') }}</p>
        <MpButton variant="secondary" left-icon="add" is-rounded @click="router.push('/projects/new')">
          {{ t('New project') }}
        </MpButton>
      </div>
    </template>
  </ErpTablePage>

  <ProjectFiltersDrawer
    v-model:is-open="filtersOpen"
    :model-value="appliedFilters"
    @apply="applyFilters"
  />

  <ScenarioFab v-model="previewMode" />
</template>

<style scoped>
/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }

/* ── Cells ──────────────────────────────────────────────────────────────── */
/* Both lines truncate inside the column rather than bleeding into the next one
   — the full name is still reachable via the cell's title attribute. */
.pr-name { display: flex; flex-direction: column; min-width: 0; max-width: 100%; }
.pr-name-main,
.pr-sub {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.pr-sub {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

/* The over-budget flag stacks UNDER its amount rather than beside it: an amount
   column is too narrow to hold both on one line without overflowing. */
.pr-amount-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--mp-spacing-1);
  min-width: 0;
}

/* "Not set" is a real state, not a value — de-emphasised by colour, never italic
   (rule/type-no-italic). */
.pr-notset { color: var(--mp-text-subtle); }

/* WIP sign carries meaning: underbilled asset vs overbilled liability. */
.pr-wip--asset { color: var(--mp-text-selected); }
.pr-wip--liability { color: var(--mp-text-danger); }

/* Executed-but-unbilled scope is exposure, not revenue — it reads as a warning. */
.pr-exposure { color: var(--mp-text-danger); }

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

/* ── Empty state (rule/empty-state-structure) ───────────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration {
  width: auto;
  height: var(--empty-illo-h, 240px);   /* natural 288×240 → keep aspect ratio */
  object-fit: contain;
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
</style>
