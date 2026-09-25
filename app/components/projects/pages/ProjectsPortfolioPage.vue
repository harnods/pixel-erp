<script setup lang="ts">
/**
 * Projects — portfolio (Story 15). Service engagements and production jobs sit in
 * one list with the same columns and the same PS- series (Story 1). Drilling in
 * lands on the project's Budget tab, not a numberless accordion.
 *
 * Index-page standard: ErpTablePage + useTableState (rule/table-use-erptablepage),
 * filter bar with ErpFilterSelect + column settings + export + search
 * (rule/filter-bar-anatomy), first-load skeleton, empty states, scenario FAB.
 */
import { MpButton, MpButtonGroup, MpIcon, MpTooltip, MpProgress } from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmMenu from '../PmMenu.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import { projects, methodLabel, type Project } from '~/data/projects'
import { projectSummary, type ProjectSummary } from '~/data/projectSummary'
import { pendingApprovals } from '~/data/projectApprovals'
import { rp, rpShort, pct } from '~/utils/projectFormat'
import { badgeProps } from '~/utils/projectStatus'

const { t } = useLocale()
const router = useRouter()

const statusFilter = ref('')
const statusOptions = computed(() => [
  { value: 'draft', label: t('Draft') }, { value: 'active', label: t('Active') }, { value: 'closed', label: t('Closed') },
])

// Row = summary flattened so every column can sort.
interface Row {
  id: string; code: string; name: string; customer: string; pm: string; shape: string; depth: number
  method: string; status: Project['status']; budget: number; committed: number; actual: number
  consumedPct: number; percentComplete: number; billed: number; wip: number; flags: number
  s: ProjectSummary
}
const scenario = ref('data')
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const allRows = computed<Row[]>(() => projects.map(p => {
  const s = projectSummary(p.id)!
  return {
    id: p.id, code: p.code, name: p.name, customer: p.customer, pm: p.pm,
    shape: p.isProduction ? 'Production' : 'Service', depth: p.depth, method: methodLabel(p), status: p.status,
    budget: s.budget ?? -1, committed: s.committed, actual: s.actual,
    consumedPct: s.budget ? (s.consumed / s.budget) * 100 : -1, percentComplete: s.percentComplete ?? -1,
    billed: s.billed, wip: s.wip, flags: s.overBudgetNodes.length + (s.coExposure ? 1 : 0) + s.pendingCount, s,
  }
}))
const rows = computed(() => (scenario.value === 'empty' ? [] : allRows.value))

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  defaultSort: { key: 'code', dir: 'desc' },
  filterFn: (r, s) => {
    const matches = !s || r.code.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.customer.toLowerCase().includes(s)
    const byStatus = !statusFilter.value || r.status === statusFilter.value
    return matches && byStatus
  },
})
watch(statusFilter, () => setPage(1))
const hasActiveFilter = computed(() => !!statusFilter.value)
function clearFilters() { statusFilter.value = ''; search.value = '' }

const columns: TableColumn[] = [
  { key: 'code', label: 'Project', kind: 'name', sortType: 'text' },
  { key: 'shape', label: 'Shape', kind: 'default', sortType: 'text' },
  { key: 'method', label: 'Method · measure', kind: 'default', sortType: 'text' },
  { key: 'status', label: 'Status', kind: 'status', sortType: 'text' },
  { key: 'budget', label: 'Budget', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'committed', label: 'Committed', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'actual', label: 'Actual', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'consumedPct', label: 'Consumed', kind: 'default', sortType: 'number' },
  { key: 'percentComplete', label: 'Completed', kind: 'number', align: 'right', sortType: 'number' },
  { key: 'billed', label: 'Billed', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'wip', label: 'WIP position', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'flags', label: 'Flags', kind: 'tags', sortType: 'number' },
]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map(c => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: t(c.label), disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]).map(c => ({ ...c, label: t(c.label) })))
function hideColumn(key: string) { columnVisibility[key] = false }

const exportOpen = ref(false)
const exportColumns = computed(() => columns.map(c => ({ key: c.key, label: t(c.label), ...(c.key === 'code' ? { required: true } : {}) })))

const open = computed(() => allRows.value.filter(r => r.status !== 'closed'))
const stats = computed(() => ({
  active: projects.filter(p => p.status === 'active').length,
  draft: projects.filter(p => p.status === 'draft').length,
  contract: open.value.reduce((s, r) => s + r.s.project.contractValue, 0),
  underbilled: open.value.filter(r => r.wip > 0).reduce((s, r) => s + r.wip, 0),
  overbilled: open.value.filter(r => r.wip < 0).reduce((s, r) => s - r.wip, 0),
  overBudget: open.value.filter(r => r.s.overBudgetNodes.length).length,
  exposure: open.value.reduce((s, r) => s + r.s.coExposure, 0),
  approvals: pendingApprovals().length,
}))

function openProject(id: string) { router.push(`/projects/${id}?tab=budget`) }
const asRow = (r: unknown) => r as Row
const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="pm-page">
    <PmTitleBar v-model:scenario="scenario" :title="t('Projects')" :scenarios="[{ label: 'Empty state', value: 'empty' }]">
      <template #actions>
        <MpButton variant="primary" is-rounded left-icon="add" @click="router.push('/projects/new')">{{ t('New project') }}</MpButton>
      </template>
    </PmTitleBar>

    <div class="pm-stage">
      <ErpTablePage
        :columns="visibleColumns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :has-active-search="!!search"
        :has-active-filter="hasActiveFilter"
        :search="search"
        filter-empty-label="project"
        actions-align-top
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @hide-column="hideColumn"
        @clear-filters="clearFilters"
      >
        <template v-if="scenario !== 'empty'" #stats>
          <div class="pm-kpis">
            <div class="pm-kpi pm-kpi--bordered">
              <div class="pm-kpi-title">{{ t('Open projects') }}</div>
              <div class="pm-kpi-period">{{ stats.active }} {{ t('active') }} · {{ stats.draft }} {{ t('draft') }}</div>
              <div class="pm-kpi-amount">{{ stats.active + stats.draft }}</div>
              <span class="pm-kpi-period">{{ rpShort(stats.contract) }} {{ t('contract value') }}</span>
            </div>
            <div class="pm-kpi pm-kpi--bordered">
              <div class="pm-kpi-title">{{ t('WIP position') }}</div>
              <div class="pm-kpi-period">{{ t('Underbilled (asset) / overbilled (liability)') }}</div>
              <div class="pm-kpi-amount"><span class="pm-pos">{{ rpShort(stats.underbilled) }}</span> / <span class="pm-neg">{{ rpShort(stats.overbilled) }}</span></div>
            </div>
            <div class="pm-kpi pm-kpi--bordered">
              <div class="pm-kpi-title">{{ t('Over budget') }}</div>
              <div class="pm-kpi-period">{{ t('Projects with a work package over its budget') }}</div>
              <div class="pm-kpi-amount" :class="{ 'pm-neg': stats.overBudget }">{{ stats.overBudget }}</div>
            </div>
            <div class="pm-kpi">
              <div class="pm-kpi-title">{{ t('Change-order exposure') }}</div>
              <div class="pm-kpi-period">{{ t('Executed but not signed off') }}</div>
              <div class="pm-kpi-amount" :class="{ 'pm-warn': stats.exposure }">{{ rp(stats.exposure) }}</div>
              <a class="pm-kpi-link" role="link" tabindex="0" @click="router.push('/project-approvals')" @keydown.enter="router.push('/project-approvals')">{{ stats.approvals }} {{ t('approvals pending') }}</a>
            </div>
          </div>
        </template>

        <template v-if="scenario !== 'empty'" #filters>
          <div class="filter-left">
            <ErpFilterSelect id="pm-status-filter" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
          </div>
          <div class="filter-right">
            <MpButtonGroup class="filter-btn-group">
              <ColumnSettingsMenu id="pm-columns" :items="columnItems" :visibility="columnVisibility" :tooltip="t('Column settings')" />
              <MpTooltip :label="t('Export')" placement="bottom">
                <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
              </MpTooltip>
            </MpButtonGroup>
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search project, customer...')" />
            </div>
          </div>
        </template>

        <template #cell-code="{ row }">
          <div>
            <span class="cell-link" role="link" tabindex="0" @click.stop="openProject(asRow(row).id)" @keydown.enter="openProject(asRow(row).id)">{{ asRow(row).code }}</span>
            <span class="pm-cell-sub">{{ asRow(row).name }}</span>
            <span class="pm-cell-sub">{{ asRow(row).customer }} · PM {{ asRow(row).pm }}</span>
          </div>
        </template>
        <template #cell-shape="{ row }">{{ t(asRow(row).shape) }} · {{ t('Depth') }} {{ asRow(row).depth }}</template>
        <template #cell-method="{ row }">{{ t(asRow(row).method) }}</template>
        <template #cell-status="{ row }"><ErpStatusBadge v-bind="badgeProps('project', asRow(row).status, t)" /></template>
        <template #cell-budget="{ row }">
          <template v-if="asRow(row).budget >= 0">{{ rp(asRow(row).budget) }}</template>
          <span v-else class="pm-warn">{{ t('Not set') }}</span>
        </template>
        <template #cell-committed="{ row }">{{ rp(asRow(row).committed) }}</template>
        <template #cell-actual="{ row }">{{ rp(asRow(row).actual) }}</template>
        <template #cell-consumedPct="{ row }">
          <div v-if="asRow(row).consumedPct >= 0">
            <div class="pm-progress-line">
              <MpProgress :value="String(Math.min(asRow(row).consumedPct, 100))" size="sm" :color="asRow(row).consumedPct > 100 ? 'negative' : asRow(row).consumedPct > 90 ? 'warning' : 'positive'" />
            </div>
            <span class="pm-cell-sub">{{ pct(asRow(row).consumedPct, 0) }} {{ t('of budget') }}</span>
          </div>
          <span v-else class="pm-muted">—</span>
        </template>
        <template #cell-percentComplete="{ row }">{{ asRow(row).percentComplete >= 0 ? pct(asRow(row).percentComplete) : '—' }}</template>
        <template #cell-billed="{ row }">{{ rp(asRow(row).billed) }}</template>
        <template #cell-wip="{ row }">
          <template v-if="asRow(row).wip">
            <span :class="asRow(row).wip > 0 ? 'pm-pos' : 'pm-neg'">{{ rp(Math.abs(asRow(row).wip)) }}</span>
            <span class="pm-cell-sub">{{ asRow(row).wip > 0 ? t('Underbilled') : t('Overbilled') }}</span>
          </template>
          <span v-else class="pm-muted">{{ rp(0) }}</span>
        </template>
        <template #cell-flags="{ row }">
          <div class="pm-row pm-gap-1">
            <ErpStatusBadge v-if="asRow(row).s.overBudgetNodes.length" v-bind="badgeProps('flag', 'over-budget', t)" :label="`${t('Over budget')} (${asRow(row).s.overBudgetNodes.length})`" />
            <ErpStatusBadge v-if="asRow(row).s.coExposure" v-bind="badgeProps('flag', 'exposure', t)" :label="`${t('CO exposure')} ${rpShort(asRow(row).s.coExposure)}`" />
            <ErpStatusBadge v-if="asRow(row).s.pendingCount" v-bind="badgeProps('flag', 'pending', t)" :label="`${asRow(row).s.pendingCount} ${t('pending')}`" />
            <span v-if="!asRow(row).flags" class="pm-muted">—</span>
          </div>
        </template>

        <template #actions="{ row }">
          <PmMenu :id="`pm-row-${asRow(row).id}`" kebab :label="t('More actions')" :items="[
            { label: t('View details'), action: () => router.push(`/projects/${asRow(row).id}`) },
            { label: t('View history'), action: () => router.push(`/project-audit-log?project=${asRow(row).id}`) },
          ]" />
        </template>

        <template #empty>
          <div class="pm-empty-full">
            <img :src="emptyIllustration" alt="" class="pm-empty-illustration" width="288" height="240" />
            <p class="pm-empty-title">{{ t('No projects') }}</p>
            <p class="pm-empty-desc">{{ t('Projects will appear here.') }}</p>
            <MpButton variant="secondary" is-rounded left-icon="add" class="pm-empty-cta" @click="router.push('/projects/new')">{{ t('New project') }}</MpButton>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <ExportModal :open="exportOpen" :title="t('Export projects')" :entity-label="t('projects')" :columns="exportColumns" :total="total" @close="exportOpen = false" @export="exportOpen = false" />
  </div>
</template>
