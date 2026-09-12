<script setup lang="ts">
/**
 * CRM — Service deals index (/crm/services), the records workspace for the custom
 * "Service deals" module. SAME layout, format, and components as the Deals index
 * (CrmDealsPage): title bar (Import + New) → five fixed metric cards → filter bar
 * (saved view · Stage · view switch · icon tools · search) → LIST (default) or
 * Stage KANBAN. Only the property/field set differs (service properties).
 *
 * Everything reads the ONE `serviceDeals` dataset + the module's configured
 * pipeline (servicePipelines), so metrics, list, and board always agree.
 */
import { ref, reactive, computed, inject, onMounted } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpIconSegmented from '~/components/patterns/ErpIconSegmented.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ImportSpreadsheetModal from '~/components/patterns/ImportSpreadsheetModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import CrmDealOwnerModal from '~/components/patterns/CrmDealOwnerModal.vue'
import { useTableState } from '~/composables/useTableState'
import { formatMoney } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  serviceDeals, serviceNo, serviceStages, serviceStageBadgeType, moveServiceDealStage,
  getCrmModule, CRM_CURRENT_USER, persistServiceDeals,
  archiveServiceDeal, restoreServiceDeal, deleteServiceDeal,
  type ServiceDeal,
} from '~/data/crm'

const { t } = useLocale()
const router = useRouter()
// Title mirrors the module name (renamable in module settings).
const moduleName = computed(() => getCrmModule('services')?.name || t('Service deals'))

// Demo "today" (same reference the Deals page uses) so metrics stay meaningful
// against the Aug–Sep seed dates.
const TODAY = '2026-09-07'
const currentMonth = TODAY.slice(0, 7)
const ME = CRM_CURRENT_USER

const asService = (row: unknown): ServiceDeal => row as ServiceDeal
function goDetail(id: string) { router.push(`/crm/services/${id}`) }
function openCreate() { router.push('/crm/services/new') }

// ── Stage helpers (from the configured pipeline) ──
const stages = computed(() => serviceStages())
function stageKind(stage: string) { return stages.value.find((s) => s.name === stage)?.kind ?? 'open' }
const isOngoing = (d: ServiceDeal) => stageKind(d.stage) === 'open'

// Owner avatar — initials on a deterministic pastel background.
function ownerInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
function ownerAvatarStyle(name: string): { background: string; color: string } {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return { background: `hsl(${hue} 62% 86%)`, color: `hsl(${hue} 55% 30%)` }
}

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 800) })

// Active records only — archived ones stay out of metrics + board.
const activeDeals = computed(() => serviceDeals.filter((d) => !d.archived))

// ── Fixed metrics (5 cards, click-through) ──
type MetricFilter = '' | 'ongoing' | 'closing' | 'overdue' | 'completed'
const metricFilter = ref<MetricFilter>('')
function applyMetric(f: MetricFilter) { metricFilter.value = metricFilter.value === f ? '' : f; view.value = 'table' }
const m = computed(() => {
  const ongoing = activeDeals.value.filter(isOngoing)
  const closing = ongoing.filter((d) => d.dueDate.startsWith(currentMonth))
  const overdue = ongoing.filter((d) => d.dueDate && d.dueDate < TODAY)
  const completed = activeDeals.value.filter((d) => stageKind(d.stage) === 'won' && d.transactionDate.startsWith(currentMonth))
  return {
    ongoingCount: ongoing.length,
    ongoingValue: ongoing.reduce((s, d) => s + d.value, 0),
    closingCount: closing.length,
    closingValue: closing.reduce((s, d) => s + d.value, 0),
    overdueCount: overdue.length,
    completedCount: completed.length,
  }
})
function matchesMetric(d: ServiceDeal): boolean {
  switch (metricFilter.value) {
    case 'ongoing':   return isOngoing(d)
    case 'closing':   return isOngoing(d) && d.dueDate.startsWith(currentMonth)
    case 'overdue':   return isOngoing(d) && !!d.dueDate && d.dueDate < TODAY
    case 'completed': return stageKind(d.stage) === 'won'
    default: return true
  }
}

// ── Saved views ──
const SAVED_VIEWS = ['All records', 'My service deals', 'Completed', 'Cancelled', 'Archived'] as const
type SavedView = typeof SAVED_VIEWS[number]
const savedView = ref<SavedView>('All records')
function matchesView(d: ServiceDeal): boolean {
  if (savedView.value === 'Archived') return !!d.archived
  if (d.archived) return false
  switch (savedView.value) {
    case 'My service deals': return d.owner === ME
    case 'Completed':   return stageKind(d.stage) === 'won'
    case 'Cancelled':   return stageKind(d.stage) === 'lost'
    default:            return true
  }
}

// ── View toggle (list default) ──
const view = ref<'table' | 'board'>('table')
const viewOptions = [
  { value: 'table', icon: 'table-view-list', label: t('List view') },
  { value: 'board', icon: 'table-view-column', label: t('Board view') },
]

// ── Table state (search + Stage filter + saved view + metric + sort) ──
const source = computed<ServiceDeal[]>(() => serviceDeals.filter((d) => matchesView(d) && matchesMetric(d)))
const {
  search, statusFilter, currentPage, perPage, sortKey, sortDir, total, paginated,
  setPage, setPerPage, toggleSort, setSort,
} = useTableState<ServiceDeal>(source, {
  perPage: 25,
  defaultSort: { key: 'transactionDate', dir: 'desc' },
  filterFn: (row, s, status) => {
    const matchesStage = !status || row.stage === status
    const matchesSearch = !s || [row.name, row.id, row.company, row.owner, row.serviceType].join(' ').toLowerCase().includes(s)
    return matchesStage && matchesSearch
  },
})

const hasActiveFilter = computed(() => !!statusFilter.value || !!metricFilter.value || savedView.value !== 'All records')
function clearFilters() { search.value = ''; statusFilter.value = ''; metricFilter.value = ''; savedView.value = 'All records' }

// ── Columns — 6 defaults + optional (Column settings) ──
const baseColumns: TableColumn[] = [
  { key: 'id',          label: t('Number'),       kind: 'default', sortable: true, sortType: 'text' },
  { key: 'name',        label: t('Service name'), kind: 'name',    sortable: true, sortType: 'text' },
  { key: 'company',     label: t('Customer'),     kind: 'name',    sortable: true, sortType: 'text' },
  { key: 'stage',       label: t('Stage'),        kind: 'status',  sortable: true, sortType: 'text' },
  { key: 'owner',       label: t('Owner'),        kind: 'name',    sortable: true, sortType: 'text' },
  { key: 'value',       label: t('Value'),        kind: 'amount',  align: 'right', sortable: true, sortType: 'number' },
]
const optionalColumns: TableColumn[] = [
  { key: 'serviceType', label: t('Service type'), kind: 'tags',    sortable: true, sortType: 'text' },
  { key: 'dueDate',     label: t('Due date'),     kind: 'date',    sortable: true, sortType: 'text' },
]
const allCols: TableColumn[] = [...baseColumns, ...optionalColumns]
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allCols.map((c) => [c.key, true])),
)
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const columns = computed<TableColumn[]>(() => allCols.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ── Board columns (respect saved view + stage filter + search + metric) ──
interface BoardColumn { stage: string; kind: string; cards: ServiceDeal[]; total: number }
const boardColumns = computed<BoardColumn[]>(() => {
  const s = search.value.trim().toLowerCase()
  return stages.value.map((st) => {
    const cards = activeDeals.value.filter((d) =>
      d.stage === st.name && matchesView(d) && matchesMetric(d) &&
      (!statusFilter.value || d.stage === statusFilter.value) &&
      (!s || [d.name, d.id, d.company, d.owner].join(' ').toLowerCase().includes(s)))
    return { stage: st.name, kind: st.kind, cards, total: cards.reduce((sum, d) => sum + d.value, 0) }
  })
})

// ── Board drag & drop ──
const draggingId = ref<string | null>(null)
const dragOverStage = ref<string | null>(null)
function onDragStart(d: ServiceDeal) { draggingId.value = d.id }
function onDragEnd() { draggingId.value = null; dragOverStage.value = null }
function onDrop(stage: string) {
  const id = draggingId.value
  onDragEnd()
  if (id) { moveServiceDealStage(id, stage); successToast(t('Stage updated')) }
}

// ── Row actions (kebab): View details · Edit · Change stage · Archive/Restore · Delete ──
function openEdit(d: ServiceDeal) { router.push(`/crm/services/${d.id}/edit`) }
function onArchive(d: ServiceDeal) { archiveServiceDeal(d.id); successToast(t('Service deal archived')) }
function onRestore(d: ServiceDeal) { restoreServiceDeal(d.id); successToast(t('Service deal restored')) }

// Change-stage modal (single record + bulk).
const stageModalOpen = ref(false)
const stageIds = ref<string[]>([])
const stagePick = ref('')
function openStageModal(d: ServiceDeal) { stageIds.value = [d.id]; stagePick.value = d.stage; stageModalOpen.value = true }
function applyStage() {
  for (const id of stageIds.value) moveServiceDealStage(id, stagePick.value)
  successToast(t('Stage updated'))
  stageModalOpen.value = false
}

// Delete confirm (single record).
const deleteOpen = ref(false)
const deleteTarget = ref<ServiceDeal | null>(null)
function askDelete(d: ServiceDeal) { deleteTarget.value = d; deleteOpen.value = true }
function confirmDelete() { if (deleteTarget.value) { deleteServiceDeal(deleteTarget.value.id); successToast(t('Service deal deleted')) } deleteOpen.value = false }

// ── Bulk actions ──
function selectedIds(selected: Set<number>): string[] {
  return [...selected].map((i) => paginated.value[i]?.id).filter(Boolean) as string[]
}
const ownerModalOpen = ref(false)
const bulkIds = ref<string[]>([])
function openBulkOwner(selected: Set<number>) { bulkIds.value = selectedIds(selected); ownerModalOpen.value = true }
function onBulkOwner(owner: string) {
  for (const id of bulkIds.value) { const d = serviceDeals.find((x) => x.id === id); if (d) d.owner = owner }
  persistServiceDeals()
  successToast(`${bulkIds.value.length} ${t('updated')} (${t('owner')} → ${owner})`)
  ownerModalOpen.value = false
}
function openBulkStage(selected: Set<number>) {
  stageIds.value = selectedIds(selected); stagePick.value = ''; stageModalOpen.value = true
}

// ── Import / Export ──
const importOpen = ref(false)
function onImportUpload(files: File[]) { importOpen.value = false; successToast(`${files.length} ${files.length === 1 ? t('file') : t('files')} ${t('queued for import')}`) }
const exportOpen = ref(false)
const exportColumns = [
  { key: 'name', label: t('Service name') }, { key: 'stage', label: t('Stage') }, { key: 'company', label: t('Customer') },
  { key: 'owner', label: t('Owner') }, { key: 'value', label: t('Value') }, { key: 'serviceType', label: t('Service type') },
  { key: 'dueDate', label: t('Due date') },
]
function onExport() { exportOpen.value = false; successToast(t('Export ready — check your downloads')) }

const toggleAirene = inject<() => void>('toggleAirene')
</script>

<template>
  <div class="crm">
    <!-- ── Title bar ── -->
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">{{ moduleName }}</h1>
      </div>
      <div class="crm-titlebar__right">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="importOpen = true">{{ t('Import') }}</MpButton>
          <MpButton variant="primary" is-rounded left-icon="add" @click="openCreate">{{ t('New service deal') }}</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <div class="cc-stage">
      <!-- ── Fixed metrics (5 cards, click-through) ── -->
      <div class="cc-stats">
        <div class="stats-section">
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'ongoing' }" @click="applyMetric('ongoing')">
            <div class="stat-title">{{ t('Total ongoing service deals') }}</div>
            <div class="stat-amount">{{ m.ongoingCount }}</div>
            <div class="stat-sub">{{ t('In the pipeline') }}</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'ongoing' }" @click="applyMetric('ongoing')">
            <div class="stat-title">{{ t('Total service deal value') }}</div>
            <div class="stat-amount">{{ formatMoney(m.ongoingValue, 'IDR') }}</div>
            <div class="stat-sub">{{ t('Ongoing, base currency') }}</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'closing' }" @click="applyMetric('closing')">
            <div class="stat-title">{{ t('Closing this month') }}</div>
            <div class="stat-amount">{{ m.closingCount }}</div>
            <div class="stat-sub">{{ formatMoney(m.closingValue, 'IDR') }}</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'overdue' }" @click="applyMetric('overdue')">
            <div class="stat-title">{{ t('Overdue') }}</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': m.overdueCount > 0 }">{{ m.overdueCount }}</div>
            <div class="stat-sub">{{ t('Past due date') }}</div>
          </button>
          <button type="button" class="stat-card" :class="{ 'stat-card--active': metricFilter === 'completed' }" @click="applyMetric('completed')">
            <div class="stat-title">{{ t('Completed this month') }}</div>
            <div class="stat-amount">{{ m.completedCount }}</div>
            <div class="stat-sub">{{ t('This period') }}</div>
          </button>
        </div>
      </div>

      <!-- ── Filter bar ── -->
      <div class="cc-filterbar">
        <div class="filter-left">
          <ErpFilterSelect
            id="svc-saved-view"
            :model-value="savedView"
            :placeholder="t('View')"
            :options="[...SAVED_VIEWS]"
            :is-clearable="false"
            @update:model-value="(v: string) => (savedView = v as SavedView)"
          />
          <ErpFilterSelect
            id="svc-stage-filter"
            :model-value="statusFilter"
            :placeholder="t('Stage')"
            :options="stages.map((s) => ({ value: s.name, label: s.name }))"
            @update:model-value="(v: string) => (statusFilter = v)"
          />
        </div>

        <div class="filter-right">
          <ErpIconSegmented id="svc-view-switch" v-model="view" :options="viewOptions" />
          <MpButtonGroup class="filter-btn-group">
            <MpTooltip :label="t('Ask Airene')" placement="bottom">
              <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
            </MpTooltip>
            <ColumnSettingsMenu v-if="view === 'table'" id="svc-columns" :items="columnItems" :visibility="columnVisibility" />
            <MpTooltip :label="t('Export')" placement="bottom">
              <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
            </MpTooltip>
          </MpButtonGroup>
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search service deals…')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
          </div>
        </div>
      </div>

      <!-- ── Board view ── -->
      <div v-if="view === 'board'" class="kanban">
        <div class="kanban__board">
          <section
            v-for="col in boardColumns"
            :key="col.stage"
            class="kcol"
            :class="{ 'kcol--over': dragOverStage === col.stage }"
            @dragover.prevent="dragOverStage = col.stage"
            @dragleave="dragOverStage === col.stage && (dragOverStage = null)"
            @drop="onDrop(col.stage)"
          >
            <header class="kcol__head">
              <span class="kcol__name">{{ col.stage }}</span>
              <span class="kcol__count">{{ col.cards.length }}</span>
            </header>
            <div class="kcol__cards">
              <article
                v-for="d in col.cards"
                :key="d.id"
                class="deal"
                :class="{ 'deal--dragging': draggingId === d.id }"
                role="button" tabindex="0" draggable="true"
                @dragstart="onDragStart(d)"
                @dragend="onDragEnd"
                @click="goDetail(d.id)"
              >
                <div class="deal__head">
                  <p class="deal__company">{{ d.company }}</p>
                  <p class="deal__name">{{ d.name }}</p>
                  <p v-if="d.serviceType" class="deal__sub">{{ d.serviceType }}</p>
                </div>
                <div class="deal__value">{{ formatMoney(d.value, 'IDR') }}</div>
                <p v-if="d.dueDate" class="deal__sub">{{ d.dueDate }}</p>
                <div class="deal__foot">
                  <span class="deal__owner">
                    <span class="deal__avatar" :style="ownerAvatarStyle(d.owner)">{{ ownerInitials(d.owner) }}</span>
                    {{ d.owner }}
                  </span>
                </div>
              </article>
              <p v-if="!col.cards.length" class="kcol__empty">{{ t('No service deals') }}</p>
            </div>
            <footer class="kcol__foot">
              <span class="kcol__total-k">{{ t('Total:') }}</span>
              <span class="kcol__total-v">{{ formatMoney(col.total, 'IDR') }}</span>
            </footer>
          </section>
        </div>
      </div>

      <!-- ── List view ── -->
      <ErpTablePage
        v-else
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :search="search"
        :has-active-filter="hasActiveFilter"
        :filter-empty-label="t('service deal')"
        has-checkbox
        :bulk-label="t('service deal')"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
        @hide-column="hideColumn"
      >
        <template #cell-id="{ row }">
          <span class="cell-link cell-text cc-num" @click.stop="goDetail(asService(row).id)">{{ serviceNo(asService(row).id) }}</span>
        </template>

        <template #cell-name="{ row }">
          <span class="cell-link cell-text" @click.stop="goDetail(asService(row).id)">{{ asService(row).name }}</span>
          <span v-if="asService(row).archived" class="cc-sub cell-text">{{ t('Archived') }}</span>
        </template>

        <template #cell-company="{ value }">{{ value || '—' }}</template>

        <template #cell-stage="{ row }">
          <ErpStatusBadge :status="asService(row).stage" :type="serviceStageBadgeType(asService(row).stage)" :label="asService(row).stage" />
        </template>

        <template #cell-owner="{ value }">{{ value || '—' }}</template>

        <template #cell-value="{ row }">{{ formatMoney(asService(row).value, 'IDR') }}</template>

        <template #cell-serviceType="{ value }">{{ value || '—' }}</template>

        <template #cell-dueDate="{ value }">{{ value ? formatDate(value as string) : '—' }}</template>

        <template #actions="{ row }">
          <MpPopover :id="`svc-actions-${asService(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <MpPopoverList>
                <MpPopoverListItem @click="goDetail(asService(row).id)">{{ t('View details') }}</MpPopoverListItem>
                <template v-if="!asService(row).archived">
                  <MpPopoverListItem @click="openEdit(asService(row))">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="openStageModal(asService(row))">{{ t('Change stage') }}</MpPopoverListItem>
                </template>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem v-if="asService(row).archived" @click="onRestore(asService(row))">{{ t('Restore') }}</MpPopoverListItem>
                <MpPopoverListItem v-else @click="onArchive(asService(row))">{{ t('Archive') }}</MpPopoverListItem>
                <MpPopoverListItem @click="askDelete(asService(row))">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #bulk-actions="{ selectedRows }">
          <button type="button" class="erp-bulk-action" @click="openBulkOwner(selectedRows as Set<number>)">{{ t('Change owner') }}</button>
          <button type="button" class="erp-bulk-action" @click="openBulkStage(selectedRows as Set<number>)">{{ t('Change stage') }}</button>
        </template>

        <template #empty>
          <div class="cc-empty">
            <img :src="'/illustrations/empty-folder.png'" alt="" class="cc-empty-illustration" width="288" height="240" />
            <p class="cc-empty-title">{{ t('No service deals') }}</p>
            <p class="cc-empty-desc">{{ t('Create a service deal to start tracking work.') }}</p>
            <MpButton variant="secondary" is-rounded left-icon="add" @click="openCreate">{{ t('New service deal') }}</MpButton>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <!-- ── Change-stage modal (single + bulk) ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="svc-stage-modal" :is-open="stageModalOpen" :is-keep-alive="false" size="sm" @close="stageModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Change stage') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <div class="svc-stage-field">
            <span class="svc-stage-label">{{ t('Stage') }}</span>
            <ErpFilterSelect id="svc-stage-pick" class="svc-stage-select" :model-value="stagePick" :placeholder="t('Select a stage')" :options="stages.map((s) => ({ value: s.name, label: s.name }))" :is-clearable="false" @update:model-value="(v: string) => (stagePick = v)" />
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup class="erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="stageModalOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="applyStage">{{ t('Save') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Bulk owner ── -->
    <CrmDealOwnerModal :open="ownerModalOpen" :count="bulkIds.length" @close="ownerModalOpen = false" @confirm="onBulkOwner" />

    <!-- ── Delete confirm ── -->
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete this service deal?')"
      :description="t('This permanently removes the record. This action cannot be undone.')"
      :confirm-label="t('Delete')"
      is-danger
      @confirm="confirmDelete"
    />

    <!-- ── Import / Export ── -->
    <ImportSpreadsheetModal :open="importOpen" :title="t('Import service deals')" @close="importOpen = false" @upload="onImportUpload" />
    <ExportModal
      :open="exportOpen"
      :title="t('Export service deals')"
      :entity-label="t('service deals')"
      :columns="exportColumns"
      :total="source.length"
      @close="exportOpen = false"
      @export="onExport"
    />
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar ── */
.crm-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.crm-titlebar__left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default, #272b32); }
.crm-titlebar__right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

/* ── Stage (scroll area) ── */
.cc-stage { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); padding: 0 var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

/* ── Stats ── */
.cc-stats { padding-top: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); }
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: 0 var(--mp-spacing-6) 0 0; align-self: stretch; background: none; border: none; text-align: left; cursor: pointer; border-radius: var(--mp-radii-md); }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.stat-card:hover .stat-title { color: var(--mp-text-link); }
.stat-card--active .stat-title { color: var(--mp-text-link); font-weight: var(--mp-font-weights-semi-bold); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }

/* ── Filter bar ── */
.cc-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-5); padding-bottom: var(--mp-spacing-5); background: var(--mp-background-stage, #fff); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
@media (max-width: 640px) {
  .cc-filterbar { flex-wrap: wrap; }
  .cc-filterbar > :last-child { flex: 1 1 100%; }
}

/* Pill search */
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-icon-default, #536062); }

/* ── Table cell helpers ── */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cc-sub { display: block; margin-top: 1px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cc-num { font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); }

/* Bulk-bar action buttons */
.erp-bulk-action { display: inline-flex; align-items: center; height: 32px; padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.erp-bulk-action:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* ── Kanban board ── */
.kanban { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; padding-bottom: var(--mp-spacing-3); }
.kanban__board { display: flex; gap: var(--mp-spacing-4); align-items: stretch; min-height: 100%; height: 100%; }
.kcol { flex: 0 0 288px; width: 288px; display: flex; flex-direction: column; min-height: 0; background: var(--mp-background-neutral-subtle, #f4f5f7); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 12px; transition: background 0.12s ease, border-color 0.12s ease; }
.kcol--over { background: var(--mp-background-brand-subtle, #e8f5f0); border-color: var(--mp-border-brand, #0a6e4e); }
.kcol__head { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-2); }
.kcol__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcol__count { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral, #fff); border-radius: 999px; padding: 1px 8px; }
.kcol__cards { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2) var(--mp-spacing-2); }
.kcol__empty { margin: 0; padding: var(--mp-spacing-4) 0; text-align: center; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.kcol__foot { display: flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3); }
.kcol__total-k { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.kcol__total-v { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* ── Card ── */
.deal { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 8px; cursor: pointer; }
.deal:hover { border-color: var(--mp-border-bold, #8c9596); }
.deal:focus-visible { outline: 2px solid var(--mp-border-brand, #0a6e4e); outline-offset: 1px; }
.deal:active { cursor: grabbing; }
.deal--dragging { opacity: 0.45; }
.deal__head { display: flex; flex-direction: column; gap: 2px; }
.deal__company { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__name { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__sub { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.deal__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.deal__owner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__avatar { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 22px; height: 22px; border-radius: var(--mp-radii-full, 999px); font-size: 10px; font-weight: var(--mp-font-weights-semi-bold); line-height: 1; letter-spacing: 0.2px; }

/* ── Empty state ── */
.cc-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); }
.cc-empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.cc-empty-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc-empty-desc { margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Change-stage modal ── */
.svc-stage-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.svc-stage-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-secondary); }
.svc-stage-select { width: 100%; }
.svc-stage-select :deep(.efs), .svc-stage-select :deep(.efs-trigger) { width: 100%; }
</style>
