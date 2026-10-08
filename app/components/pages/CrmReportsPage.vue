<script setup lang="ts">
/**
 * CRM — Reports library (/crm/reports).
 *
 * Rebuilt per "PRD: Mekari ERP CRM — Reports V1" — replaces the old Deals
 * pipeline dashboard entirely. The canonical Reports landing page: a
 * permission-aware (mocked) library of report DEFINITIONS, not a fixed set of
 * charts. See app/data/crmReports.ts for the data model / scope notes.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import {
  MpIcon, MpButton, MpButtonGroup, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import CrmReportsFiltersDrawer, { emptyReportsFilters, type ReportsFiltersValue } from '~/components/patterns/CrmReportsFiltersDrawer.vue'
import { useTableState } from '~/composables/useTableState'
import { successToast } from '~/utils/toasts'
import {
  crmReports, reportSourceModules, reportIsMine, reportIsSharedWithMe, reportIsAccessibleToMe,
  cloneCrmReport, archiveCrmReport, restoreCrmReport, canManageReport,
  transferCrmReport, setCrmReportVisibility,
  REPORT_OWNER_OPTIONS, type CrmReport, type ReportVisibility,
} from '~/data/crmReports'
import { CRM_CURRENT_USER, getCrmModule } from '~/data/crm'

const props = defineProps<{ orderId: string }>()

const { t } = useLocale()
const router = useRouter()

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Library view — a level-2 sidebar nav item (CrmSidebar.vue's Reports
// children), not an in-page tab. Driven entirely by the orderId prop the
// router resolves from /crm/reports, /crm/reports/mine, /shared, /archived. ──
type LibraryView = 'all' | 'mine' | 'shared' | 'archived'
const activeView = computed<LibraryView>(() => {
  if (props.orderId === 'mine' || props.orderId === 'shared' || props.orderId === 'archived') return props.orderId
  return 'all'
})

const visibleByView = computed<CrmReport[]>(() => {
  switch (activeView.value) {
    case 'mine': return crmReports.filter((r) => r.status !== 'archived' && reportIsMine(r))
    case 'shared': return crmReports.filter((r) => r.status !== 'archived' && reportIsSharedWithMe(r))
    case 'archived': return crmReports.filter((r) => r.status === 'archived' && reportIsAccessibleToMe(r))
    default: return crmReports.filter((r) => r.status !== 'archived' && reportIsAccessibleToMe(r))
  }
})

// ─── Filters — a single "All filters" drawer (rule/filter-bar-all-filters-drawer):
// Module + Owner (Is any of / Is none of) and Status + Visibility (checkboxes). ──
const reportFilters = ref<ReportsFiltersValue>(emptyReportsFilters())
const filtersOpen = ref(false)
function openFilters() { filtersOpen.value = true }
function onApplyFilters(f: ReportsFiltersValue) { reportFilters.value = f; filtersOpen.value = false }

const moduleNames = computed(() => reportSourceModules.value.map((m) => m.name))
const ownerNames = [...REPORT_OWNER_OPTIONS]
// {value,label} shape for the Transfer-ownership ErpFilterSelect (below), as opposed
// to ownerNames' plain string[] for the tag-comparator drawer field.
const ownerSelectOptions = REPORT_OWNER_OPTIONS.map((o) => ({ value: o, label: o }))
const statusOptions = [
  { value: 'active', label: t('Active') },
  { value: 'archived', label: t('Archived') },
]
const visibilityOptions = [
  { value: 'private', label: t('Private') },
  { value: 'selected', label: t('Selected Users/Teams') },
  { value: 'everyone', label: t('Everyone eligible') },
]

// Apply an "Is any of / Is none of" tag comparator against a row value.
function matchTag(comparator: 'isAnyOf' | 'isNoneOf', values: string[], value: string): boolean {
  if (!values.length) return true
  const has = values.includes(value)
  return comparator === 'isAnyOf' ? has : !has
}

const filteredRows = computed<CrmReport[]>(() => {
  const f = reportFilters.value
  return visibleByView.value.filter((r) =>
    matchTag(f.moduleComparator, f.modules, moduleName(r.primaryModuleId))
    && matchTag(f.ownerComparator, f.owners, r.ownerId)
    && (!f.statuses.length || f.statuses.includes(r.status))
    && (!f.visibilities.length || f.visibilities.includes(r.visibility)),
  )
})

const activeFilterCount = computed(() => {
  const f = reportFilters.value
  return f.modules.length + f.owners.length + f.statuses.length + f.visibilities.length
})
const hasActiveFilter = computed(() => !!search.value || activeFilterCount.value > 0)
function clearFilters() { search.value = ''; reportFilters.value = emptyReportsFilters() }

// ─── Table ──────────────────────────────────────────────────────────────────
const allCols: TableColumn[] = [
  { key: 'name', label: 'Name', kind: 'name', sortType: 'text' },
  { key: 'primaryModuleId', label: 'Module', sortType: 'text' },
  { key: 'ownerId', label: 'Owner', sortType: 'text' },
  { key: 'visibility', label: 'Visibility', sortType: 'text' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'updatedAt', label: 'Last updated', kind: 'date', sortType: 'date' },
]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map((c) => [c.key, true])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const columns = computed<TableColumn[]>(() => allCols.filter((c) => columnVisibility[c.key]))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<CrmReport>(filteredRows, {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s) || (row.description ?? '').toLowerCase().includes(s),
})

function moduleName(id: string): string { return getCrmModule(id)?.name ?? id }
function visibilityLabel(v: ReportVisibility): string {
  return v === 'private' ? t('Private') : v === 'selected' ? t('Selected Users/Teams') : t('Everyone eligible')
}
function statusType(status: CrmReport['status']): 'completed' | 'announcement' {
  return status === 'active' ? 'completed' : 'announcement'
}
function statusLabel(status: CrmReport['status']): string {
  return status === 'active' ? t('Active') : t('Archived')
}

// ─── Row actions ────────────────────────────────────────────────────────────
function openReport(r: CrmReport) { router.push(`/crm/reports/${r.id}`) }
function editReport(r: CrmReport) { router.push(`/crm/reports/${r.id}/edit`) }
function duplicate(r: CrmReport) {
  const clone = cloneCrmReport(r.id)
  if (clone) successToast(t('Report duplicated'))
}

// Archive / Restore — confirmed (rule/btn-danger-confirm scope also applied here
// for consistency, though Archive/Restore are non-destructive/reversible).
const archiveTarget = ref<CrmReport | null>(null)
function openArchive(r: CrmReport) { archiveTarget.value = r }
function confirmArchive() {
  if (!archiveTarget.value) return
  if (archiveTarget.value.status === 'archived') { restoreCrmReport(archiveTarget.value.id); successToast(t('Report restored')) }
  else { archiveCrmReport(archiveTarget.value.id); successToast(t('Report archived')) }
  archiveTarget.value = null
}
const archiveTitle = computed(() => archiveTarget.value?.status === 'archived' ? t('Restore report?') : t('Archive report?'))
const archiveDescription = computed(() => archiveTarget.value?.status === 'archived' ? t('This report will be restored to the active list.') : t('This report will be archived. You can restore it later.'))
const archiveConfirmLabel = computed(() => archiveTarget.value?.status === 'archived' ? t('Restore report') : t('Archive report'))


// Transfer ownership modal
const transferTarget = ref<CrmReport | null>(null)
const transferTo = ref('')
const transferError = ref('')
function openTransfer(r: CrmReport) { transferTarget.value = r; transferTo.value = ''; transferError.value = '' }
function confirmTransfer() {
  if (!transferTarget.value) return
  if (!transferTo.value) { transferError.value = t('Select a new owner before transferring.'); return }
  transferError.value = ''
  transferCrmReport(transferTarget.value.id, transferTo.value)
  successToast(t('Report ownership transferred'))
  transferTarget.value = null
}

// Change visibility modal
const visTarget = ref<CrmReport | null>(null)
const visChoice = ref<ReportVisibility>('private')
function openVisibility(r: CrmReport) { visTarget.value = r; visChoice.value = r.visibility }
function confirmVisibility() {
  if (!visTarget.value) return
  setCrmReportVisibility(visTarget.value.id, visChoice.value, visChoice.value === 'selected' ? [CRM_CURRENT_USER] : undefined)
  successToast(t('Report visibility updated'))
  visTarget.value = null
}

const emptyIllustration = '/illustrations/empty-folder.png'
const emptyCopy = computed(() => {
  if (activeView.value === 'archived') return { title: t('No archived reports'), desc: t('Reports you archive will appear here.') }
  if (activeView.value === 'mine') return { title: t('No reports yet'), desc: t('Reports you create will appear here.') }
  if (activeView.value === 'shared') return { title: t('No reports shared with you'), desc: t('Reports another user shares with you will appear here.') }
  return { title: t('No reports yet'), desc: t('Create a report to summarize your CRM data.') }
})
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">{{ t('Reports') }}</h1>
      </div>
      <div class="crm-titlebar__right">
        <MpButton variant="primary" is-rounded left-icon="add" @click="router.push('/crm/reports/new')">
          {{ t('Create report') }}
        </MpButton>
      </div>
    </header>

    <div class="cc-stage">
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
        :has-active-filter="hasActiveFilter"
        filter-empty-label="report"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <MpButton class="btn-enterprise btn-enterprise--secondary filter-all-btn" type="button" left-icon="filter" @click="openFilters">
              {{ t('All filters') }}{{ activeFilterCount ? ` (${activeFilterCount})` : '' }}
            </MpButton>
          </div>
          <div class="filter-right">
            <MpButtonGroup class="filter-btn-group">
              <ColumnSettingsMenu id="rpt-columns" :items="columnItems" :visibility="columnVisibility" />
            </MpButtonGroup>
            <div class="filter-search">
              <MpIcon name="search" size="md" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search reports...')">
              <MpButton v-if="search" variant="ghost" is-rounded class="filter-search-clear" left-icon="close" :aria-label="t('Clear search')" @click="search = ''" />
            </div>
          </div>
        </template>

        <template #cell-name="{ value, row }">
          <a class="cell-link" @click.stop="openReport(row as unknown as CrmReport)">{{ value }}</a>
        </template>
        <template #cell-primaryModuleId="{ value }">{{ moduleName(value as string) }}</template>
        <template #cell-ownerId="{ value }">{{ value }}</template>
        <template #cell-visibility="{ value }">{{ visibilityLabel(value as ReportVisibility) }}</template>
        <template #cell-status="{ row }">
          <ErpStatusBadge :status="(row as unknown as CrmReport).status" :type="statusType((row as unknown as CrmReport).status)" :label="statusLabel((row as unknown as CrmReport).status)" />
        </template>
        <template #cell-updatedAt="{ row }">
          <LastUpdatedCell :at="(row as unknown as CrmReport).updatedAt" :by="(row as unknown as CrmReport).updatedBy" />
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`rpt-actions-${(row as unknown as CrmReport).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="openReport(row as unknown as CrmReport)">{{ t('View details') }}</MpPopoverListItem>
                <MpPopoverListItem @click="editReport(row as unknown as CrmReport)">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem @click="duplicate(row as unknown as CrmReport)">{{ t('Duplicate') }}</MpPopoverListItem>
                <MpPopoverListItem @click="openVisibility(row as unknown as CrmReport)">{{ t('Change visibility') }}</MpPopoverListItem>
                <MpPopoverListItem @click="openTransfer(row as unknown as CrmReport)">{{ t('Transfer ownership') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="canManageReport(row as unknown as CrmReport)" data-devchange="crm-reports-no-delete" @click="openArchive(row as unknown as CrmReport)">
                  {{ (row as unknown as CrmReport).status === 'archived' ? t('Restore') : t('Archive') }}
                </MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #empty>
          <div class="empty-full">
            <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
            <p class="empty-full-title">{{ emptyCopy.title }}</p>
            <p class="empty-full-desc">{{ emptyCopy.desc }}</p>
            <MpButton v-if="activeView !== 'archived' && activeView !== 'shared'" variant="secondary" is-rounded left-icon="add" @click="router.push('/crm/reports/new')">
              {{ t('Create report') }}
            </MpButton>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <!-- All filters drawer -->
    <CrmReportsFiltersDrawer
      id="rpt-filters"
      :is-open="filtersOpen"
      :model-value="reportFilters"
      :module-options="moduleNames"
      :owner-options="ownerNames"
      :status-options="statusOptions"
      :visibility-options="visibilityOptions"
      @update:is-open="filtersOpen = $event"
      @apply="onApplyFilters"
    />

    <!-- Archive / Restore confirmation -->
    <ConfirmModal
      :is-open="!!archiveTarget"
      :title="archiveTitle"
      :description="archiveDescription"
      :confirm-label="archiveConfirmLabel"
      :is-danger="false"
      @update:is-open="(v) => { if (!v) archiveTarget = null }"
      @confirm="confirmArchive"
    />

    <!-- ── Transfer ownership ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="rpt-transfer-modal" :is-open="!!transferTarget" size="md" :is-keep-alive="false" @close="transferTarget = null">
      <MpModalContent>
        <MpModalHeader>{{ t('Transfer ownership') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="rpt-modal-desc">{{ t('The new owner can edit, share, and manage this report. This does not change its visibility or shared audience.') }}</p>
          <ErpFilterSelect id="rpt-transfer-to" v-model="transferTo" :placeholder="t('New owner')" :options="ownerSelectOptions" width="100%" />
          <p v-if="transferError" class="rpt-modal-error">{{ transferError }}</p>
        </MpModalBody>
        <MpModalFooter>
          <MpButton class="btn-enterprise btn-enterprise--ghost" @click="transferTarget = null">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" @click="confirmTransfer">{{ t('Transfer') }}</MpButton>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Change visibility ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="rpt-visibility-modal" :is-open="!!visTarget" size="md" :is-keep-alive="false" @close="visTarget = null">
      <MpModalContent>
        <MpModalHeader>{{ t('Change visibility') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <ErpFilterSelect id="rpt-vis-choice" v-model="visChoice" :placeholder="t('Visibility')" :options="visibilityOptions" width="100%" />
          <p class="rpt-modal-desc">{{ t('Sharing lets others discover and run this report. It does not grant them edit, export, or underlying data access beyond their own permissions.') }}</p>
        </MpModalBody>
        <MpModalFooter>
          <MpButton class="btn-enterprise btn-enterprise--ghost" @click="visTarget = null">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" @click="confirmVisibility">{{ t('Save') }}</MpButton>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.crm-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.crm-titlebar__left { display: flex; flex-direction: column; gap: 2px; }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default, #272b32); }

.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-btn-group { display: flex; align-items: center; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); font-weight: var(--mp-font-weights-semi-bold); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-62, 248px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
/* rule/form-focus-border-bold — every hand-rolled input's focus/active state is a
   neutral bold border + 1px neutral ring, never Pixel's default brand-emerald ring. */
.filter-search:focus-within {
  border-color: var(--mp-colors-border-bold, #8c9596);
  box-shadow: 0 0 0 1px var(--mp-colors-border-bold, #8c9596);
}
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.filter-search-clear { display: inline-flex !important; align-items: center; justify-content: center; width: 20px !important; height: 20px !important; min-width: 0 !important; padding: 0 !important; color: var(--mp-text-subtle); }

.rpt-modal-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0 0 var(--mp-spacing-3); }
.rpt-modal-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: var(--mp-spacing-2) 0 0; }

.cell-link { color: var(--mp-text-link); cursor: pointer; white-space: normal; word-break: break-word; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: 2px; margin-bottom: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
