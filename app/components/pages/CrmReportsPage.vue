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
  MpTabs, MpTabList, MpTab,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { useTableState } from '~/composables/useTableState'
import { successToast } from '~/utils/toasts'
import {
  crmReports, reportSourceModules, reportIsMine, reportIsSharedWithMe, reportIsAccessibleToMe,
  cloneCrmReport, archiveCrmReport, restoreCrmReport, transferCrmReport, setCrmReportVisibility,
  REPORT_OWNER_OPTIONS, type CrmReport, type ReportVisibility,
} from '~/data/crmReports'
import { CRM_CURRENT_USER, getCrmModule } from '~/data/crm'

const props = defineProps<{ orderId: string }>()

const { t } = useLocale()
const router = useRouter()

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Library view tabs ──────────────────────────────────────────────────────
type LibraryView = 'all' | 'mine' | 'shared' | 'archived'
const VIEW_ORDER: LibraryView[] = ['all', 'mine', 'shared', 'archived']
const activeView = ref<LibraryView>(props.orderId === 'archived' ? 'archived' : 'all')
// MpTabs' v-model is a numeric index, not the MpTab `value` string — bridge it
// to the string-keyed activeView the rest of this page's filtering uses.
const activeTabIndex = computed({
  get: () => VIEW_ORDER.indexOf(activeView.value),
  set: (idx: number) => { activeView.value = VIEW_ORDER[idx] ?? 'all' },
})

const visibleByView = computed<CrmReport[]>(() => {
  switch (activeView.value) {
    case 'mine': return crmReports.filter((r) => r.status !== 'archived' && reportIsMine(r))
    case 'shared': return crmReports.filter((r) => r.status !== 'archived' && reportIsSharedWithMe(r))
    case 'archived': return crmReports.filter((r) => r.status === 'archived' && reportIsAccessibleToMe(r))
    default: return crmReports.filter((r) => r.status !== 'archived' && reportIsAccessibleToMe(r))
  }
})

// ─── Filters ────────────────────────────────────────────────────────────────
const moduleFilter = ref('')
const ownerFilter = ref('')
const visibilityFilter = ref('')

const moduleOptions = computed(() => reportSourceModules.value.map((m) => ({ value: m.id, label: m.name })))
const ownerOptions = REPORT_OWNER_OPTIONS.map((o) => ({ value: o, label: o }))
const visibilityOptions = [
  { value: 'private', label: t('Private') },
  { value: 'selected', label: t('Selected Users/Teams') },
  { value: 'everyone', label: t('Everyone eligible') },
]

const filteredRows = computed<CrmReport[]>(() =>
  visibleByView.value.filter((r) =>
    (!moduleFilter.value || r.primaryModuleId === moduleFilter.value)
    && (!ownerFilter.value || r.ownerId === ownerFilter.value)
    && (!visibilityFilter.value || r.visibility === visibilityFilter.value),
  ),
)

// ─── Table ──────────────────────────────────────────────────────────────────
const allCols: TableColumn[] = [
  { key: 'name', label: 'Report name', kind: 'name', sortType: 'text' },
  { key: 'primaryModuleId', label: 'Primary module', sortType: 'text' },
  { key: 'ownerId', label: 'Owner', sortType: 'text' },
  { key: 'visibility', label: 'Visibility', sortType: 'text' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'updatedAt', label: 'Last modified', kind: 'date', sortType: 'date' },
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
function statusType(status: CrmReport['status']): 'completed' | 'warning' | 'announcement' {
  return status === 'active' ? 'completed' : status === 'needs-attention' ? 'warning' : 'announcement'
}
function statusLabel(status: CrmReport['status']): string {
  return status === 'active' ? t('Active') : status === 'needs-attention' ? t('Needs attention') : t('Archived')
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Row actions ────────────────────────────────────────────────────────────
function openReport(r: CrmReport) { router.push(`/crm/reports/${r.id}`) }
function editReport(r: CrmReport) { router.push(`/crm/reports/${r.id}/edit`) }
function duplicate(r: CrmReport) {
  const clone = cloneCrmReport(r.id)
  if (clone) successToast(t('Report duplicated'))
}
function doArchive(r: CrmReport) { archiveCrmReport(r.id); successToast(t('Report archived')) }
function doRestore(r: CrmReport) { restoreCrmReport(r.id); successToast(t('Report restored')) }

// Transfer ownership modal
const transferTarget = ref<CrmReport | null>(null)
const transferTo = ref('')
function openTransfer(r: CrmReport) { transferTarget.value = r; transferTo.value = '' }
function confirmTransfer() {
  if (!transferTarget.value || !transferTo.value) return
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

    <MpTabs id="rpt-view-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="rpt-tabs">
      <MpTabList>
        <MpTab id="rpt-tab-all" value="all">{{ t('All accessible reports') }}</MpTab>
        <MpTab id="rpt-tab-mine" value="mine">{{ t('My reports') }}</MpTab>
        <MpTab id="rpt-tab-shared" value="shared">{{ t('Shared with me') }}</MpTab>
        <MpTab id="rpt-tab-archived" value="archived">{{ t('Archived') }}</MpTab>
      </MpTabList>
    </MpTabs>

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
        :has-active-search="!!search || !!moduleFilter || !!ownerFilter || !!visibilityFilter"
        filter-empty-label="report"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="search = ''; moduleFilter = ''; ownerFilter = ''; visibilityFilter = ''"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="rpt-module-filter" v-model="moduleFilter" :placeholder="t('Primary module')" :options="moduleOptions" />
            <ErpFilterSelect id="rpt-owner-filter" v-model="ownerFilter" :placeholder="t('Owner')" :options="ownerOptions" />
            <ErpFilterSelect id="rpt-visibility-filter" v-model="visibilityFilter" :placeholder="t('Visibility')" :options="visibilityOptions" />
          </div>
          <div class="filter-right">
            <MpButtonGroup class="filter-btn-group">
              <ColumnSettingsMenu id="rpt-columns" :items="columnItems" :visibility="columnVisibility" />
            </MpButtonGroup>
            <div class="filter-search">
              <MpIcon name="search" size="md" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search reports...')">
              <MpButton v-if="search" variant="ghost" class="filter-search-clear" left-icon="close" :aria-label="t('Clear search')" @click="search = ''" />
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
          <div class="rpt-updated">
            <span>{{ formatDate((row as unknown as CrmReport).updatedAt) }}</span>
            <span class="rpt-updated-by">{{ (row as unknown as CrmReport).updatedBy }}</span>
          </div>
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`rpt-actions-${(row as unknown as CrmReport).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="openReport(row as unknown as CrmReport)">{{ t('Run') }}</MpPopoverListItem>
                <MpPopoverListItem @click="editReport(row as unknown as CrmReport)">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem @click="duplicate(row as unknown as CrmReport)">{{ t('Clone') }}</MpPopoverListItem>
                <MpPopoverListItem @click="openVisibility(row as unknown as CrmReport)">{{ t('Change visibility') }}</MpPopoverListItem>
                <MpPopoverListItem @click="openTransfer(row as unknown as CrmReport)">{{ t('Transfer ownership') }}</MpPopoverListItem>
                <MpPopoverListItem
                  v-if="(row as unknown as CrmReport).status !== 'archived'"
                  :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
                  @click="doArchive(row as unknown as CrmReport)"
                >{{ t('Archive') }}</MpPopoverListItem>
                <MpPopoverListItem v-else @click="doRestore(row as unknown as CrmReport)">{{ t('Restore') }}</MpPopoverListItem>
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

    <!-- ── Transfer ownership ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="rpt-transfer-modal" :is-open="!!transferTarget" size="md" :is-keep-alive="false" @close="transferTarget = null">
      <MpModalContent>
        <MpModalHeader>{{ t('Transfer ownership') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="rpt-modal-desc">{{ t('The new owner can edit, share, and manage this report. This does not change its visibility or shared audience.') }}</p>
          <ErpFilterSelect id="rpt-transfer-to" v-model="transferTo" :placeholder="t('New owner')" :options="ownerOptions" width="100%" />
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="transferTarget = null">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" :disabled="!transferTo" @click="confirmTransfer">{{ t('Transfer') }}</button>
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
          <button class="btn-enterprise btn-enterprise--ghost" @click="visTarget = null">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmVisibility">{{ t('Save') }}</button>
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

/* Real Pixel tabs (not a hand-rolled nav) — variant-color="green" is the ERP's
   established active-tab color (see BatchDetailsPage.vue and the tab_section_header
   convention), so this matches every other tabbed page instead of inventing its
   own active-state color. Sits below the title bar and above .cc-stage — outside
   the scrollable main/stage area, not inside it. */
.rpt-tabs { flex-shrink: 0; padding: 0 var(--mp-spacing-6); background: var(--mp-background-neutral, #fff); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }

.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-btn-group { display: flex; align-items: center; }
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

.rpt-updated { display: flex; flex-direction: column; gap: 2px; }
.rpt-updated-by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.rpt-modal-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0 0 var(--mp-spacing-3); }

.cell-link { color: var(--mp-text-link); cursor: pointer; white-space: normal; word-break: break-word; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: 2px; margin-bottom: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
