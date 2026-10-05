<script setup lang="ts">
/**
 * Budget lines (PRD FG-1, UX2): one row per line on the exact department ×
 * project × account mix, for the selected budget year. Filters on several
 * dimensions at once; the stats band totals whatever the filters leave, so the
 * filtered totals add up (FG1-AC3). Title-bar actions come through linesUi.
 */
import { MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import BudgetLineFiltersDrawer from '~/components/patterns/BudgetLineFiltersDrawer.vue'
import BudgetLineFormDrawer from '~/components/patterns/BudgetLineFormDrawer.vue'
import BudgetLineImportDrawer from '~/components/patterns/BudgetLineImportDrawer.vue'
import BudgetLineLockDrawer from '~/components/patterns/BudgetLineLockDrawer.vue'
import BudgetLineCompareDrawer from '~/components/patterns/BudgetLineCompareDrawer.vue'
import { budget, isLocked, currentVersion, yearState, LOCKED_EDIT_MESSAGE, BUDGET_TODAY } from '~/data/budgetStore'
import {
  linesUi, lineAccess, linesForYear, lineRow, matchesLineFilters, emptyLineFilters, lineFilterCount, totalsOf,
  BUDGET_LINE_YEARS, DEPT_OPTIONS, PROJECT_OPTIONS, shortDate, type LineFilters, type LineRow,
} from '~/data/budgetUiLines'
import { formatIDRWhole } from '~/utils/currency'

defineProps<{ orderId?: string }>()
const { t } = useLocale()
const router = useRouter()

const access = computed(() => lineAccess(budget.viewAs))
const year = computed(() => linesUi.year)
const locked = computed(() => isLocked(year.value))
const yearValue = computed({ get: () => String(linesUi.year), set: (v: string) => { if (v) linesUi.year = Number(v) } })
const yearOptions = computed(() => BUDGET_LINE_YEARS.map((y) => ({ value: String(y), label: t(`Budget ${y} · ${isLocked(y) ? 'Locked' : 'Draft'}`) })))

// ── Rows and filters ────────────────────────────────────────────────────────
const lines = computed(() => linesForYear(year.value, budget.viewAs))
const allRows = computed<LineRow[]>(() => lines.value.map(lineRow))

const filters = reactive<LineFilters>(emptyLineFilters())
const search = ref('')
function setFilters(v: LineFilters) { Object.assign(filters, v) }

// The bar's department and project selects edit the same filter as the drawer.
const deptLabelOf = (id: string) => DEPT_OPTIONS.find((o) => o.value === id)?.label ?? id
const projectLabelOf = (id: string | null) => PROJECT_OPTIONS.find((o) => o.value === id)?.label ?? String(id)
const deptPick = computed({
  get: () => filters.depts.map(deptLabelOf),
  set: (labels: string[]) => { filters.depts = DEPT_OPTIONS.filter((o) => labels.includes(o.label)).map((o) => o.value) },
})
const projectPick = computed({
  get: () => filters.projects.map(projectLabelOf),
  set: (labels: string[]) => { filters.projects = PROJECT_OPTIONS.filter((o) => labels.includes(o.label)).map((o) => o.value) },
})

const filtered = computed(() => {
  const q = search.value.toLowerCase().trim()
  return allRows.value.filter((r) => matchesLineFilters(r, filters)
    && (!q || `${r.deptLabel} ${r.projectLabel} ${r.accountLabel}`.toLowerCase().includes(q)))
})
const filterCount = computed(() => lineFilterCount(filters))
const hasActiveFilter = computed(() => filterCount.value > 0 || !!search.value.trim())
function clearFilters() { setFilters(emptyLineFilters()); search.value = '' }
watch(year, () => clearFilters())

const totals = computed(() => totalsOf(filtered.value))

// ── Table state ─────────────────────────────────────────────────────────────
const { currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort } =
  useTableState(filtered, { perPage: 25 })

const columns = computed<TableColumn[]>(() => {
  const full = access.value.detail
  return [
    { key: 'deptLabel', label: 'Department', kind: 'default', sortType: 'text' },
    { key: 'projectLabel', label: 'Project', kind: 'default', sortType: 'text' },
    { key: 'accountLabel', label: 'Account', kind: 'name', sortType: 'text' },
    { key: 'classLabel', label: 'Class', kind: 'unit', sortType: 'text' },
    { key: 'budget', label: 'Year budget', kind: 'amount', align: 'right', sortType: 'number' },
    ...(full ? [
      { key: 'reserved', label: 'Reserved', kind: 'amount', align: 'right', sortType: 'number' },
      { key: 'committed', label: 'Committed', kind: 'amount', align: 'right', sortType: 'number' },
      { key: 'actual', label: 'Actual', kind: 'amount', align: 'right', sortType: 'number' },
    ] as TableColumn[] : []),
    { key: 'available', label: 'Available', kind: 'amount', align: 'right', sortType: 'number' },
    { key: 'versionLabel', label: 'Version', kind: 'unit', sortType: 'text' },
  ]
})

function openLine(row: Record<string, unknown>) { router.push(`/budget-lines/${(row as unknown as LineRow).id}`) }

// ── Stats ───────────────────────────────────────────────────────────────────
const versionNo = computed(() => currentVersion(year.value))
const versionCaption = computed(() => {
  if (!locked.value) return t(yearState(year.value) ? 'Draft, not locked' : 'Draft, no lines yet')
  const v = budget.versions.filter((x) => x.year === year.value).sort((a, b) => b.no - a.no)[0]
  return v ? t(`${v.type} · ${shortDate(v.at)}`) : ''
})
const scopeCaption = computed(() => (hasActiveFilter.value ? t('Matching the filters') : access.value.dept ? t('Your department') : t('All lines')))
const asOf = computed(() => t(`Year ${year.value} · as of ${shortDate(BUDGET_TODAY)}`))

// ── Actions ─────────────────────────────────────────────────────────────────
const formOpen = ref(false)
const editLineId = ref<string | null>(null)
const importOpen = ref(false)
const lockOpen = ref(false)
const compareOpen = ref(false)
const filtersOpen = ref(false)
/** Inline refusal for a hidden or blocked path (never a toast). */
const refusal = ref('')
const lockedMessage = computed(() => t(LOCKED_EDIT_MESSAGE))

function openNew() {
  refusal.value = ''
  if (!access.value.manage) { refusal.value = t('Only the Budget Controller adds budget lines.'); return }
  if (locked.value) { router.push('/budget-changes/new?kind=Mid-year%20insert'); return }
  editLineId.value = null
  formOpen.value = true
}
function openImport() {
  refusal.value = ''
  if (!access.value.manage) { refusal.value = t('Only the Budget Controller imports budget lines.'); return }
  if (locked.value) { refusal.value = lockedMessage.value; return }
  importOpen.value = true
}
function openLock() {
  refusal.value = ''
  if (!access.value.manage) { refusal.value = t('Only the Budget Controller locks the budget.'); return }
  if (locked.value) { refusal.value = t(`${year.value} is already locked.`); return }
  lockOpen.value = true
}
function editAmounts(r: LineRow) {
  refusal.value = ''
  if (!access.value.manage) { refusal.value = t('Only the Budget Controller changes budget lines.'); return }
  if (locked.value) { refusal.value = lockedMessage.value; return }
  editLineId.value = r.id
  formOpen.value = true
}
function revise(r: LineRow) { router.push(`/budget-changes/new?kind=Revision&line=${r.id}`) }

watch(() => linesUi.request?.nonce, () => {
  const a = linesUi.request?.action
  if (a === 'new') openNew()
  else if (a === 'import') openImport()
  else if (a === 'lock') openLock()
  else if (a === 'compare') { refusal.value = ''; compareOpen.value = true }
})
watch(() => budget.viewAs, () => { refusal.value = '' })
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
    filter-empty-label="budget lines"
    :search="search"
    :has-active-filter="hasActiveFilter"
    is-row-clickable
    data-tour="budget-lines-table"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
    @row-click="openLine"
  >
    <template #stats>
      <div class="stats-section" data-tour="budget-line-stats">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Lines') }}</div>
          <div class="stat-period">{{ scopeCaption }}</div>
          <div class="stat-amount">{{ totals.lines }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Year budget') }}</div>
          <div class="stat-period">{{ asOf }}</div>
          <div class="stat-amount">{{ formatIDRWhole(totals.budget) }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Available') }}</div>
          <div class="stat-period">{{ asOf }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--danger': totals.available < 0 }">{{ formatIDRWhole(totals.available) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('Current version') }}</div>
          <div class="stat-period">{{ versionCaption }}</div>
          <div class="stat-amount">{{ locked ? t(`Version ${versionNo}`) : t('Draft') }}</div>
          <a v-if="locked && access.detail" class="stat-link" @click="compareOpen = true">{{ t('Compare versions') }}</a>
        </div>
      </div>
      <div v-if="refusal" class="bl-refusal" role="alert">
        <MpIcon name="info" size="sm" />
        <span>{{ refusal }}</span>
        <span v-if="refusal === lockedMessage && access.manage" class="cell-link" @click="router.push('/budget-changes/new?kind=Revision')">{{ t('Raise a revision') }}</span>
      </div>
    </template>

    <template #filters>
      <div class="filter-left" data-tour="budget-lines-filters">
        <ErpFilterSelect id="bl-year" v-model="yearValue" :placeholder="t('Budget year')" :options="yearOptions" width="208px" :is-clearable="false" />
        <MultiSelectDropdown id="bl-dept" v-model="deptPick" :options="DEPT_OPTIONS.map((o) => o.label)" :placeholder="t('Department')" />
        <MultiSelectDropdown id="bl-project" v-model="projectPick" :options="PROJECT_OPTIONS.map((o) => o.label)" :placeholder="t('Project')" />
        <MpButton class="filter-all-btn" :class="{ 'filter-all-btn--active': filterCount > 0 }" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}{{ filterCount > 0 ? ` (${filterCount})` : '' }}
        </MpButton>
        <MpButton v-if="hasActiveFilter" variant="ghost" is-rounded @click="clearFilters">{{ t('Clear filters') }}</MpButton>
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <template #cell-accountLabel="{ row, value }">
      <span class="cell-link cell-text" @click.stop="openLine(row)">{{ value }}</span>
    </template>
    <template #cell-projectLabel="{ row, value }">
      <span :class="{ 'bl-muted': !(row as unknown as LineRow).project }">{{ value }}</span>
    </template>
    <template #cell-budget="{ value }">{{ formatIDRWhole(value as number) }}</template>
    <template #cell-reserved="{ value }">{{ formatIDRWhole(value as number) }}</template>
    <template #cell-committed="{ value }">{{ formatIDRWhole(value as number) }}</template>
    <template #cell-actual="{ value }">{{ formatIDRWhole(value as number) }}</template>
    <template #cell-available="{ value }">
      <span :class="{ 'bl-negative': (value as number) < 0 }">{{ formatIDRWhole(value as number) }}</span>
    </template>
    <template #cell-versionLabel="{ value }">
      <span :class="{ 'bl-muted': value === 'Draft' }">{{ t(value as string) }}</span>
    </template>

    <template v-if="access.detail" #actions="{ row }">
      <MpPopover :id="`bl-row-${(row as unknown as LineRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="openLine(row)">{{ t('View line') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="access.manage" @click="editAmounts(row as unknown as LineRow)">{{ t('Edit amounts') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="access.manage && locked" @click="revise(row as unknown as LineRow)">{{ t('Revise') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t(`No budget lines for ${year} yet`) }}</p>
        <p class="empty-full-desc">
          {{ access.manage ? t('Import the approved budget from the template, or add lines one by one.') : t('Lines appear here once Finance loads the budget.') }}
        </p>
        <div v-if="access.manage && !locked" class="empty-actions">
          <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="openImport">{{ t('Import') }}</button>
          <MpButton is-rounded left-icon="add" @click="openNew">{{ t('New budget line') }}</MpButton>
        </div>
      </div>
    </template>
  </ErpTablePage>

  <BudgetLineFiltersDrawer :is-open="filtersOpen" :model-value="filters" @update:model-value="setFilters" @close="filtersOpen = false" />
  <BudgetLineFormDrawer :is-open="formOpen" :year="year" :line-id="editLineId" @close="formOpen = false" />
  <BudgetLineImportDrawer :is-open="importOpen" :year="year" @close="importOpen = false" />
  <BudgetLineLockDrawer :is-open="lockOpen" :year="year" @close="lockOpen = false" />
  <BudgetLineCompareDrawer :is-open="compareOpen" :year="year" :lines="lines" @close="compareOpen = false" />
</template>

<style scoped>
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6); align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap;
}
.stat-period {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap;
}
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-link {
  display: inline-flex; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-colors-text-link, #165082); line-height: var(--mp-line-heights-md);
  text-decoration: none; cursor: pointer; padding: 0 var(--mp-spacing-0\.5);
}

.bl-refusal {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-colors-background-warning); border-radius: var(--mp-radii-md);
  color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-all-btn {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.filter-all-btn--active {
  background: var(--mp-background-neutral-subtle) !important;
  border-color: var(--mp-colors-border-bold, #8c9596) !important;
  color: var(--mp-text-selected, var(--mp-colors-text-link, #165082)) !important;
}
.filter-left :deep(.msd-field) { width: 152px; }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
  border: none; background: transparent; cursor: pointer; color: var(--mp-text-secondary);
}

.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.bl-negative { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
.bl-muted { color: var(--mp-text-secondary); }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-actions { display: flex; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); }
</style>
