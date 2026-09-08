<!--
  Settings > Dimensions — management table (shown once the tenant has clicked
  "Start using Dimensions" on DimensionsPaywallPage.vue). Lists every
  classification dimension against the plan's quota, with the standard
  ERP index-page filter bar + table.

  STATES INCLUDED: loading skeleton, full empty (no data ever), inline empty
  (search/status filter eliminates all rows), populated table.

  "+ New dimension" (page title bar, [...slug].vue, signalled via
  useDimensionsFormDrawer) and each row's kebab "Edit" action both open
  DimensionFormDrawer.vue (create/edit form — name, transaction type, values,
  mandatory toggle). "View details" still shows a "coming soon" toast — no
  detail page exists yet.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  MpIcon, MpSelect, MpProgress,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import DimensionFormDrawer from '~/components/patterns/DimensionFormDrawer.vue'
import DimensionDetailDrawer from '~/components/patterns/DimensionDetailDrawer.vue'
import { infoToast } from '~/utils/toasts'
import {
  dimensions, DIMENSIONS_QUOTA, setDimensionStatus, deleteDimension, addDimension, updateDimension,
  transactionTypeLabel, DIMENSION_TRANSACTION_TYPE_OPTIONS, type Dimension, type DimensionInput,
} from '~/data/dimensions'

// A dimension edited/created via DimensionFormDrawer never stores the legacy
// 'all' sentinel — it always saves an explicit array (see Dimension['transactionTypes']
// doc comment) — so "every transaction type selected" needs its own check here,
// same summary as the drawer's own MultiSelectDropdown "All transactions" label.
function isAllTransactionTypes(dim: Dimension): boolean {
  return dim.transactionTypes === 'all' || dim.transactionTypes.length === DIMENSION_TRANSACTION_TYPE_OPTIONS.length
}

const { t } = useLocale()

function soon(what: string) { infoToast(`${what} — coming soon`) }

// First-load skeleton (ERP guideline: 3 solid rows, ~1.2s) — also drives the
// quota bar's Skeleton state (Figma "_Part / Quota", State=Skeleton).
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ── Quota scenario (demo-fab, bottom-right) — preview every Figma "_Part /
//    Quota" state without needing to actually archive/delete real dimensions
//    down to those counts. 'live' drives everything from the real persisted
//    data; the other three swap in static preview data/flags. ──
const { quotaScenario, setQuotaScenario } = useDimensionsQuotaScenario()
const UNDER_QUOTA_DEMO: Dimension[] = [
  { id: 'demo-branch', name: 'Branch', values: [{ name: 'Jakarta', userIds: [] }, { name: 'Bogor', userIds: [] }], transactionTypes: ['sales', 'purchases', 'expenses'], mandatory: false, status: 'active', updatedAt: new Date().toISOString(), updatedBy: 'Rizal Candra' },
]
const effectiveDimensions = computed<Dimension[]>(() => {
  if (quotaScenario.value === 'empty') return []
  if (quotaScenario.value === 'under-quota') return UNDER_QUOTA_DEMO
  return dimensions
})
const effectiveQuota = computed(() => (quotaScenario.value === 'under-quota' ? 2 : DIMENSIONS_QUOTA))
const effectiveLoading = computed(() => loading.value || quotaScenario.value === 'skeleton')

// ── Quota (used = active + archived; deleting frees the slot, archiving doesn't) ──
const quotaUsed = computed(() => effectiveDimensions.value.length)
const quotaPct = computed(() => Math.min(100, Math.round((quotaUsed.value / effectiveQuota.value) * 100)))
const quotaReached = computed(() => quotaUsed.value >= effectiveQuota.value)
// Nothing has been created yet → no quota bar. A "0 of 5 used" progress bar on
// the first-run empty state is noise; the quota only becomes meaningful once
// there's something occupying it. Still shows during the loading skeleton.
const showQuota = computed(() => effectiveLoading.value || quotaUsed.value > 0)
// The quota bar always shows (incl. on the true "no dimensions ever" empty
// state — 0 of N used). Only the filter bar (Status/search/column settings)
// hides there, since there's nothing yet to filter; it stays during the
// Skeleton preview and once any status/search filter could apply (i.e.
// there's at least one real dimension).
const showFilters = computed(() => effectiveLoading.value || effectiveDimensions.value.length > 0)

// ── Columns ──
const columns: TableColumn[] = [
  { key: 'name',              label: 'Name',              kind: 'name', sortable: true, sortType: 'text' },
  { key: 'values',            label: 'Values',            kind: 'tags' },
  { key: 'transactionType',   label: 'Transaction type' },
  { key: 'status',            label: 'Status',            kind: 'status', sortType: 'text' },
  { key: 'lastUpdated',       label: 'Last updated',      kind: 'date' },
]

// ── Table state ──
const rows = computed<Dimension[]>(() => effectiveDimensions.value)

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Dimension>(rows, {
  perPage: 25,
  filterFn: (row, s, status) => {
    const matchesSearch = row.name.toLowerCase().includes(s)
    const matchesStatus = !status || row.status === status
    return matchesSearch && matchesStatus
  },
})

// ── Status filter ──
const statusOptions = [
  { label: t('Active'),   value: 'active'   },
  { label: t('Archived'), value: 'archived' },
]
const statusLabel = computed(() => statusOptions.find((o) => o.value === statusFilter.value)?.label ?? '')

function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Column visibility — "Last updated" is hidden by default, toggled via the
//    column-settings gear-pair icon in the filter bar. ──
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map((c) => [c.key, c.key !== 'lastUpdated'])),
)
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ── Archive / activate (reversible — archiving asks for confirmation since it
//    stops the dimension from being tagged on new transaction lines, mirroring
//    ApprovalWorkflowsPage's "Turn off" confirmation pattern). ──
const addQuotaModalOpen = ref(false)
function closeAddQuotaModal() { addQuotaModalOpen.value = false }

const archiveModalOpen = ref(false)
const dimensionToArchive = ref<Dimension | null>(null)
function handleToggleStatus(row: Dimension) {
  if (row.status === 'active') { dimensionToArchive.value = row; archiveModalOpen.value = true; return }
  setDimensionStatus(row.id, 'active')
  toast.notify({ variant: 'success', title: t('Dimension activated'), maxWidth: 'max-content' })
}
function closeArchiveModal() { archiveModalOpen.value = false; dimensionToArchive.value = null }
function confirmArchive() {
  if (!dimensionToArchive.value) return
  setDimensionStatus(dimensionToArchive.value.id, 'archived')
  toast.notify({ variant: 'success', title: t('Dimension archived'), maxWidth: 'max-content' })
  closeArchiveModal()
}

// ── Delete ──
const deleteModalOpen = ref(false)
const dimensionToDelete = ref<Dimension | null>(null)
function openDeleteModal(row: Dimension) { dimensionToDelete.value = row; deleteModalOpen.value = true }
function closeDeleteModal() { deleteModalOpen.value = false; dimensionToDelete.value = null }
function confirmDelete() {
  if (!dimensionToDelete.value) return
  deleteDimension(dimensionToDelete.value.id)
  toast.notify({ variant: 'success', title: t('Dimension deleted'), maxWidth: 'max-content' })
  closeDeleteModal()
}

// ── Create / edit drawer — creation always checks the REAL quota (not the
//    demo-fab's preview scenario, which never mutates persisted data). The
//    title bar's "+ New dimension" button lives in [...slug].vue, outside this
//    component, so it signals through useDimensionsFormDrawer instead of a
//    direct prop/emit. ──
const { createRequestId } = useDimensionsFormDrawer()
const formDrawerOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formTarget = ref<Dimension | null>(null)

function openCreateForm() {
  if (dimensions.length >= DIMENSIONS_QUOTA) {
    toast.notify({ variant: 'error', title: t('Quota reached. Archive a dimension to create a new one.'), maxWidth: 'max-content' })
    return
  }
  formMode.value = 'create'
  formTarget.value = null
  formDrawerOpen.value = true
}
function openEditForm(row: Dimension) {
  formMode.value = 'edit'
  formTarget.value = row
  formDrawerOpen.value = true
}
function handleSaveDimension(input: DimensionInput) {
  if (formMode.value === 'create') {
    addDimension(input)
    toast.notify({ variant: 'success', title: t('Dimension saved'), maxWidth: 'max-content' })
  } else if (formTarget.value) {
    updateDimension(formTarget.value.id, input)
    toast.notify({ variant: 'success', title: t('Changes saved'), maxWidth: 'max-content' })
  }
}
watch(createRequestId, () => openCreateForm())

// ── View details drawer ──
const detailDrawerOpen = ref(false)
const detailTarget = ref<Dimension | null>(null)
function openDetail(row: Dimension) { detailTarget.value = row; detailDrawerOpen.value = true }

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
    :loading="effectiveLoading"
    :has-active-search="!!search"
    :has-active-filter="!!statusFilter"
    filter-empty-label="dimension"
    actions-align-top
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="() => { search = ''; statusFilter = '' }"
  >

    <!-- ── Quota bar (Figma "_Part / Quota") — a fixed 280px column (label + bar),
         not full table width, sitting in a full-width divider row. Skeleton state
         (no value, plain gray bar, no hint) shows during the first-load skeleton.
         Hidden on the true empty state — see `showQuota`. ── -->
    <template #stats>
      <div v-if="showQuota" class="dim-quota-row">
        <div class="dim-quota">
          <div class="dim-quota-label-row">
            <span class="dim-quota-label">{{ t('Dimensions quota') }}</span>
            <span v-if="!effectiveLoading" class="dim-quota-value">
              <span class="dim-quota-value-used">{{ quotaUsed }}</span>
              <span class="dim-quota-value-of">{{ t('of') }}</span>
              <span class="dim-quota-value-total">{{ effectiveQuota }} {{ t('used') }}</span>
            </span>
          </div>
          <div v-if="effectiveLoading" class="dim-quota-bar-skeleton" />
          <MpProgress v-else color="positive" :value="String(quotaPct)" />
        </div>
        <p v-if="!effectiveLoading && quotaUsed > 0 && !quotaReached" class="dim-quota-hint">
          {{ t('Gain deeper insights with more dimensions.') }}
          <a class="dim-quota-hint-link" @click="addQuotaModalOpen = true">{{ t('Add quota') }}</a>
        </p>
        <p v-else-if="!effectiveLoading && quotaReached" class="dim-quota-hint">{{ t('Quota reached. Archive a dimension to create a new one.') }}</p>
      </div>
    </template>

    <!-- ── Filter bar (Status select + column settings + search) — hidden on the
         true "no dimensions ever" empty state (matches the Figma first-run
         empty state), stays otherwise. ── -->
    <template v-if="showFilters" #filters>
      <div class="filter-left">
        <MpPopover id="dim-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="dim-status-select"
              :placeholder="t('Status')"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
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
      </div>
      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu id="dim-columns" :items="columnItems" :visibility="columnVisibility" />
          <button class="filter-icon-btn" type="button" :aria-label="t('Export')" @click="soon(t('Export'))">
            <MpIcon name="download" size="md" />
          </button>
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search dimension name')" />
        </div>
      </div>
    </template>

    <!-- ── Cell: Name ── -->
    <template #cell-name="{ value }">
      <span class="cell-text cell-name">{{ value }}</span>
    </template>

    <!-- ── Cell: Values ── -->
    <template #cell-values="{ row }">
      <ErpTagList
        :tags="(row as unknown as Dimension).values.map((v) => v.name)"
        :title="`${(row as unknown as Dimension).name} ${t('values')}`"
        :id="`dim-values-${(row as unknown as Dimension).id}`"
        variant="card"
        :max-visible="7"
        more-label="Show"
      />
    </template>

    <!-- ── Cell: Transaction type ── -->
    <template #cell-transactionType="{ row }">
      <span v-if="isAllTransactionTypes(row as unknown as Dimension)" class="cell-text">{{ t('All transactions') }}</span>
      <ul v-else class="dim-type-list">
        <li v-for="tt in (row as unknown as Dimension).transactionTypes" :key="tt">{{ t(transactionTypeLabel(tt)) }}</li>
      </ul>
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as unknown as Dimension).status" />
    </template>

    <!-- ── Cell: Last updated ── -->
    <template #cell-lastUpdated="{ row }">
      <div class="cell-last-updated">
        <span class="cell-last-updated__date">{{ formatUpdatedAt((row as unknown as Dimension).updatedAt) }}</span>
        <span class="cell-last-updated__by">{{ (row as unknown as Dimension).updatedBy }}</span>
      </div>
    </template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`dim-actions-${(row as unknown as Dimension).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab btn-enterprise" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openDetail(row as unknown as Dimension)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openEditForm(row as unknown as Dimension)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="handleToggleStatus(row as unknown as Dimension)">
              {{ (row as unknown as Dimension).status === 'active' ? t('Archive') : t('Activate') }}
            </MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
              @click="openDeleteModal(row as unknown as Dimension)"
            >
              {{ t('Delete') }}
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No dimensions') }}</p>
        <p class="empty-full-desc">{{ t('Dimensions will appear here.') }}</p>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before empty-full-cta" type="button" @click="openCreateForm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New dimension') }}
        </button>
      </div>
    </template>

  </ErpTablePage>

  <!-- ── Create / edit drawer ── -->
  <DimensionFormDrawer
    id="dim-form-drawer"
    v-model:is-open="formDrawerOpen"
    :mode="formMode"
    :model-value="formTarget"
    @save="handleSaveDimension"
  />

  <!-- ── View details drawer — its "Actions" dropdown reuses the same handlers
       as the row kebab (Edit / Archive-Activate / Delete). ── -->
  <DimensionDetailDrawer
    id="dim-detail-drawer"
    v-model:is-open="detailDrawerOpen"
    :dimension="detailTarget"
    @edit="openEditForm"
    @toggle-status="handleToggleStatus"
    @delete="openDeleteModal"
  />

  <!-- ── Demo scenario FAB — preview the quota bar's Empty / Skeleton / under-quota
       ("Half") / at-quota ("Upgraded") states without touching real data, matching
       ApprovalWorkflowsPage.vue's demo-fab convention exactly. ── -->
  <MpPopover id="dim-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab btn-enterprise" :aria-label="t('Change scenario state')">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
      <p class="demo-fab-heading">{{ t('Dimensions quota state') }}</p>
      <MpPopoverList>
        <MpPopoverListItem :is-active="quotaScenario === 'live'" @click="setQuotaScenario('live')">{{ t('Live data') }}</MpPopoverListItem>
        <MpPopoverListItem :is-active="quotaScenario === 'empty'" @click="setQuotaScenario('empty')">{{ t('Empty') }}</MpPopoverListItem>
        <MpPopoverListItem :is-active="quotaScenario === 'under-quota'" @click="setQuotaScenario('under-quota')">{{ t('Under quota') }}</MpPopoverListItem>
        <MpPopoverListItem :is-active="quotaScenario === 'skeleton'" @click="setQuotaScenario('skeleton')">{{ t('Skeleton') }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>

  <!-- ── Archive confirmation modal — reversible (can be re-activated), so the
       primary button is the standard (non-danger) state. ── -->
  <MpModal
    id="dim-archive-modal"
    :is-open="archiveModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeArchiveModal"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Archive dimension?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('This dimension will no longer be available to tag on new transaction lines. You can activate it again anytime.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeArchiveModal">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmArchive">{{ t('Archive') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Delete confirmation modal ── -->
  <MpModal
    id="dim-delete-modal"
    :is-open="deleteModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeDeleteModal"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Delete dimension?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('Deleted dimension cannot be restored, and any transaction lines tagged with it will lose that tag.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeDeleteModal">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Add quota modal — self-serve quota increases aren't supported yet;
       points the user at their account manager / support instead. ── -->
  <MpModal
    id="dim-add-quota-modal"
    :is-open="addQuotaModalOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeAddQuotaModal"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Add quota') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('Contact your account manager or email support-mekarierp@mekari.com to increase your quota.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="closeAddQuotaModal">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="closeAddQuotaModal">{{ t('Contact account manager') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* ── Quota bar (#stats slot, Figma "_Part / Quota") ──
   Outer row spans the full table width with a bottom divider; the label+bar
   column itself stays a fixed 280px (NOT full width) with the hint text below
   at 336px, per the design's own Progress-bar/Caption sizing. */
.dim-quota-row {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  padding-bottom: var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.dim-quota { width: 280px; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dim-quota-label-row { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.dim-quota-label { flex: 1 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dim-quota-value { display: flex; align-items: baseline; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); white-space: nowrap; }
.dim-quota-value-used { color: var(--mp-text-secondary); }
.dim-quota-value-of { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.dim-quota-value-total { color: var(--mp-text-default); }
.dim-quota-bar-skeleton { width: 100%; height: 8px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-border-default, #e3e7e9); }
.dim-quota-hint { margin: 0; width: 336px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.dim-quota-hint-link { color: var(--mp-text-link); cursor: pointer; }

/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2); border: none; background: transparent;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral, #ffffff); color: var(--mp-text-secondary);
  min-width: 200px;
}
.filter-search-input {
  flex: 1; border: none; background: transparent;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-md); outline: none;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Cells ── */
.cell-text { display: block; white-space: normal; word-break: break-word; }
.cell-name { font-weight: var(--mp-font-weights-medium, 500); }

.dim-type-list { margin: 0; padding-left: var(--mp-spacing-4); list-style: disc; }
.dim-type-list li { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.cell-last-updated { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.cell-last-updated__date { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.cell-last-updated__by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; background: none;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-full-cta { margin-top: var(--mp-spacing-5); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* Demo scenario FAB — matches ApprovalWorkflowsPage.vue's convention exactly. */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: var(--mp-text-inverse);
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2); /* pixel-police-allow-shadow: floating FAB, not a surface/card */
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
