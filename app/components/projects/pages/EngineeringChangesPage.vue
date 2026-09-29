<script setup lang="ts">
/**
 * Engineering changes — every ECO across projects (PRD v6.2 §7 · BOM Versioning &
 * ECO-lite P-11). An ECO is never created here: it is raised when Production
 * publishes a new version of a locked project BOM. The PM works the list —
 * Open first — and decides each one on its own page.
 *
 * Index-page standard: ErpTablePage + useTableState (rule/table-use-erptablepage),
 * semantic column kinds (rule/table-column-kind), filter bar with ErpFilterSelect +
 * search pill (rule/filter-bar-anatomy), 3-row first-load skeleton
 * (rule/skeleton-3-rows), illustrated empty state (rule/table-empty-state).
 */
import { MpButton, MpIcon } from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmMenu from '../PmMenu.vue'
import BomDetailOverlay from '../BomDetailOverlay.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { engineeringChanges, ecoPath, getEco, ECO_REASON_LABELS, type EcoReason, type EcoStatus, type EngineeringChange } from '~/data/projectChanges'
import { projects, getProject, getWorkPackage } from '~/data/projects'
import { getCustomBom } from '~/data/projectBoms'
import { ecoExistingWos, ecoRoute } from '~/data/projectActions'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const { t } = useLocale()
const router = useRouter()

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const statusFilter = ref('')
const projectFilter = ref('')
const reasonFilter = ref('')
const STATUSES: EcoStatus[] = ['open', 'pending_approval', 'decided', 'implemented', 'closed']
const statusOptions = computed(() => STATUSES.map(s => ({ value: s, label: badgeProps('eco', s, t).label })))
const projectOptions = computed(() => projects.filter(p => p.isProduction).map(p => ({ value: p.id, label: `${p.code} · ${p.name}` })))
const reasonOptions = computed(() => (Object.keys(ECO_REASON_LABELS) as EcoReason[]).map(k => ({ value: k, label: t(ECO_REASON_LABELS[k]) })))

// Open first, then waiting on Finance, then the rest of the lifecycle; newest first within a group.
const STATUS_RANK: Record<EcoStatus, number> = { open: 0, pending_approval: 1, decided: 2, implemented: 3, closed: 4 }

interface Row {
  id: string; no: string; title: string; statusRank: number; status: EcoStatus
  project: string; projectId: string; bom: string; versions: string; reasonLabel: string
  existing: string; publishedAt: string; publishedBy: string; e: EngineeringChange
}
function existingText(e: EngineeringChange): string {
  if (e.status === 'open' || e.status === 'pending_approval') {
    const open = ecoExistingWos(e).filter(w => ecoRoute(w) !== 'untouched').length
    return open ? `${open} ${t('open to decide')}` : t('None open')
  }
  if (e.adoption === 'none' || !e.decisions.length) return t('None adopted')
  return `${e.decisions.length} ${t('adopted')}`
}
const rows = computed<Row[]>(() => engineeringChanges
  .slice().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  .map(e => ({
    id: e.id, no: e.no, title: e.title, statusRank: STATUS_RANK[e.status], status: e.status,
    project: `${getProject(e.projectId)?.code} · ${getProject(e.projectId)?.name}`, projectId: e.projectId,
    bom: getCustomBom(e.customBomId)?.name ?? '—', versions: `v${e.fromVersion} → v${e.toVersion}`,
    reasonLabel: t(ECO_REASON_LABELS[e.reason]), existing: existingText(e),
    publishedAt: e.publishedAt, publishedBy: e.publishedBy, e,
  })))

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  defaultSort: { key: 'statusRank', dir: 'asc' },
  filterFn: (r, s) => {
    const matches = !s || r.no.toLowerCase().includes(s) || r.title.toLowerCase().includes(s) || r.bom.toLowerCase().includes(s) || r.project.toLowerCase().includes(s)
    return matches
      && (!statusFilter.value || r.status === statusFilter.value)
      && (!projectFilter.value || r.projectId === projectFilter.value)
      && (!reasonFilter.value || r.e.reason === reasonFilter.value)
  },
})
watch([statusFilter, projectFilter, reasonFilter], () => setPage(1))
const hasActiveFilter = computed(() => !!statusFilter.value || !!projectFilter.value || !!reasonFilter.value)
function clearFilters() { statusFilter.value = ''; projectFilter.value = ''; reasonFilter.value = ''; search.value = '' }

const columns = computed<TableColumn[]>(() => [
  { key: 'no', label: t('ECO number'), kind: 'number', sortType: 'text' },
  { key: 'statusRank', label: t('Status'), kind: 'status', sortType: 'number' },
  { key: 'project', label: t('Project'), kind: 'name', sortType: 'text' },
  { key: 'bom', label: t('Project BOM'), kind: 'name', sortType: 'text' },
  { key: 'versions', label: t('Version'), sortType: 'text' },
  { key: 'reasonLabel', label: t('Reason'), sortType: 'text' },
  { key: 'existing', label: t('Existing work orders'), sortType: 'text' },
  { key: 'publishedAt', label: t('Published on'), kind: 'date', sortType: 'text' },
])
const asRow = (r: unknown) => r as Row
const open = (id: string) => { const e = getEco(id); if (e) router.push(ecoPath(e)) }
const bomView = ref<string | undefined>()
const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="pm-page" data-devchange="eco-index">
    <PmTitleBar :title="t('Engineering changes')" />
    <div class="pm-stage">
      <ErpTablePage
        :columns="columns"
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
        filter-empty-label="engineering change"
        actions-align-top
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="eco-status-filter" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
            <ErpFilterSelect id="eco-project-filter" v-model="projectFilter" :placeholder="t('Project')" :options="projectOptions" width="240px" />
            <ErpFilterSelect id="eco-reason-filter" v-model="reasonFilter" :placeholder="t('Reason')" :options="reasonOptions" width="200px" />
          </div>
          <div class="filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search ECO, BOM, project...')" />
            </div>
          </div>
        </template>

        <template #cell-no="{ row }">
          <div>
            <span class="cell-link" role="link" tabindex="0" @click.stop="open(asRow(row).id)" @keydown.enter="open(asRow(row).id)">{{ asRow(row).no }}</span>
            <span class="pm-cell-sub">{{ asRow(row).title }}</span>
          </div>
        </template>
        <template #cell-statusRank="{ row }"><ErpStatusBadge v-bind="badgeProps('eco', asRow(row).status, t)" /></template>
        <template #cell-project="{ row }">
          <div>
            <span>{{ getProject(asRow(row).projectId)?.code }}</span>
            <span class="pm-cell-sub">{{ getProject(asRow(row).projectId)?.name }}</span>
          </div>
        </template>
        <template #cell-bom="{ row }">
          <div>
            <span>{{ asRow(row).bom }}</span>
            <span class="pm-cell-sub">{{ getWorkPackage(asRow(row).e.wpId)?.code }} {{ getWorkPackage(asRow(row).e.wpId)?.name }}</span>
          </div>
        </template>
        <template #cell-publishedAt="{ row }">
          <div>
            <span>{{ formatDate(asRow(row).publishedAt) }}</span>
            <span class="pm-cell-sub">{{ asRow(row).publishedBy }}</span>
          </div>
        </template>

        <template #actions="{ row }">
          <PmMenu :id="`eco-row-${asRow(row).id}`" kebab :label="t('More actions')" :items="[
            { label: asRow(row).status === 'open' ? t('Decide') : t('View engineering change'), action: () => open(asRow(row).id) },
            { label: t('View project BOM'), action: () => (bomView = asRow(row).e.customBomId) },
            { label: t('Open project'), action: () => router.push(`/projects/${asRow(row).projectId}?tab=production`) },
          ]" />
        </template>

        <template #empty>
          <div class="pm-empty-full">
            <img :src="emptyIllustration" alt="" class="pm-empty-illustration" width="288" height="240" />
            <p class="pm-empty-title">{{ t('No engineering changes yet') }}</p>
            <p class="pm-empty-desc">{{ t('One is raised when Production publishes a new version of a project BOM that work orders already use.') }}</p>
            <MpButton variant="secondary" is-rounded class="pm-empty-cta" @click="router.push('/projects')">{{ t('Go to projects') }}</MpButton>
          </div>
        </template>
      </ErpTablePage>
    </div>
    <BomDetailOverlay :open="!!bomView" :bom-id="bomView" @close="bomView = undefined" />
  </div>
</template>
