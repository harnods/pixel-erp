<!-- prod-parity: jurnal-frontend-app/src/pages/other-lists/import-group/index.vue (+ list/list.vue, components/advance-search, components/import-status-banner) -->
<script setup lang="ts">
/**
 * Other lists → Export & import (prod "Import & Export List"). Page tabs Import /
 * Export ([...slug].vue pageTabs). Import: About-import-status banner, Feature +
 * Status quick filters, search, Filter drawer (Keywords, Start/End date, Feature,
 * Status), columns Date & time · Status · Name · Feature · Import successes count,
 * row action Delete. Export: Feature + Status, columns Date & time · Status ·
 * Feature · Period, row action Download.
 */
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip, MpInput, MpDatePicker,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerCloseButton,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatDateTime } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  importFiles, exportFiles, deleteImportFile, IMPORT_FEATURES, EXPORT_FEATURES,
  type ImportFile, type ExportFile, type ImportStatus, type ExportStatus,
} from '~/data/otherLists'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const isImport = computed(() => (route.query.tab as string | undefined) !== 'Export')

type BadgeType = 'completed' | 'warning' | 'critical' | 'announcement'
const STATUS: Record<ImportStatus | ExportStatus, { label: string; type: BadgeType }> = {
  ok: { label: 'Completed', type: 'completed' },
  complete: { label: 'Completed', type: 'completed' },
  email_failed: { label: 'Completed', type: 'completed' },
  pending_delete: { label: 'Pending deletion', type: 'warning' },
  queue: { label: 'In queue', type: 'warning' },
  queued: { label: 'In queue', type: 'warning' },
  processing: { label: 'In progress', type: 'warning' },
  working: { label: 'Working', type: 'warning' },
  partial_ok: { label: 'Partially imported', type: 'warning' },
  failed: { label: 'Failed to import', type: 'critical' },
  failed_to_delete: { label: 'Failed to delete', type: 'critical' },
}
function statusOf(s: ImportStatus | ExportStatus) {
  const c = STATUS[s]
  if (s === 'failed' && !isImport.value) return { label: 'Failed to export', type: c.type }
  return c
}

const IMPORT_STATUS_KEYS: ImportStatus[] = ['ok', 'pending_delete', 'queue', 'processing', 'failed', 'failed_to_delete', 'partial_ok']
const EXPORT_STATUS_KEYS: ExportStatus[] = ['queued', 'working', 'complete', 'failed']
const statusOptions = computed(() => (isImport.value ? IMPORT_STATUS_KEYS : EXPORT_STATUS_KEYS)
  .map((s) => ({ value: s, label: t(statusOf(s).label) })))
const featureOptions = computed(() => (isImport.value ? IMPORT_FEATURES : EXPORT_FEATURES).map((f) => ({ value: f, label: t(f) })))

// ── Filters ──
const featureFilter = ref('')
const statusFilter = ref('')
const startDate = ref('')
const endDate = ref('')
watch(isImport, () => { featureFilter.value = ''; statusFilter.value = ''; startDate.value = ''; endDate.value = ''; search.value = '' })

function toIso(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }
function inDateRange(iso: string) {
  const day = iso.slice(0, 10)
  if (startDate.value && day < toIso(startDate.value)) return false
  if (endDate.value && day > toIso(endDate.value)) return false
  return true
}
type Row = (ImportFile | ExportFile) & { [k: string]: unknown }
const rows = computed<Row[]>(() => {
  const src = (isImport.value ? importFiles : exportFiles) as Row[]
  return src.filter((r) => {
    if (featureFilter.value && r.feature !== featureFilter.value) return false
    if (statusFilter.value) {
      const st = r.status as string
      if (statusFilter.value === 'complete' ? !['complete', 'email_failed'].includes(st) : st !== statusFilter.value) return false
    }
    return inDateRange(r.createdAt)
  })
})

const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s) => !s || String((row as ImportFile).fileName ?? row.feature).toLowerCase().includes(s),
  defaultSort: { key: 'createdAt', dir: 'desc' },
})

const columns = computed<TableColumn[]>(() => isImport.value
  ? [
      { key: 'createdAt', label: t('Date & time'), kind: 'date', sortable: true, sortType: 'date' },
      { key: 'status', label: t('Status'), kind: 'status' },
      { key: 'fileName', label: t('Name'), kind: 'address' },
      { key: 'feature', label: t('Feature') },
      { key: 'successAmount', label: t('Import successes count') },
    ]
  : [
      { key: 'createdAt', label: t('Date & time'), kind: 'date', sortable: true, sortType: 'date' },
      { key: 'status', label: t('Status'), kind: 'status' },
      { key: 'feature', label: t('Feature'), kind: 'address' },
      { key: 'period', label: t('Period') },
    ])

const activeDrawerFilter = computed(() => !!startDate.value || !!endDate.value)
const hasActiveFilter = computed(() => !!search.value || !!featureFilter.value || !!statusFilter.value || activeDrawerFilter.value)
function clearFilters() { search.value = ''; featureFilter.value = ''; statusFilter.value = ''; startDate.value = ''; endDate.value = '' }

function successCount(r: ImportFile) {
  if (r.status === 'queue' || r.status === 'processing') return '-'
  return `${r.passedRows} ${t('of')} ${r.totalRows}`
}

// ── Row action ──
function canDelete(r: ImportFile) {
  return r.ableToDestroy && ['ok', 'failed_to_delete', 'partial_ok', 'failed'].includes(r.status)
}
function canDownload(r: ExportFile) { return r.status === 'complete' || r.status === 'email_failed' }
const deleteOpen = ref(false)
const toDelete = ref<ImportFile | null>(null)
function askDelete(r: ImportFile) { toDelete.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (!toDelete.value) return
  deleteImportFile(toDelete.value.id)
  successToast(t('Import file deleted'))
  toDelete.value = null
}
function openDetail(r: ImportFile) { router.push(`/export-and-import/${r.id}`) }

// ── About import status banner ──
const bannerOpen = ref(true)

// ── Filter drawer (Filter import list) ──
const drawerOpen = ref(false)
const draft = reactive({ keyword: '', start: '', end: '', feature: '', status: '' })
const draftError = ref(false)
function openDrawer() {
  Object.assign(draft, { keyword: search.value, start: startDate.value, end: endDate.value, feature: featureFilter.value, status: statusFilter.value })
  draftError.value = false
  drawerOpen.value = true
}
function resetDraft() { Object.assign(draft, { keyword: '', start: '', end: '', feature: '', status: '' }); draftError.value = false }
function applyDrawer() {
  if (draft.start && draft.end && toIso(draft.start) > toIso(draft.end)) { draftError.value = true; return }
  search.value = draft.keyword; startDate.value = draft.start; endDate.value = draft.end
  featureFilter.value = draft.feature; statusFilter.value = draft.status
  drawerOpen.value = false
}
</script>

<template>
  <div class="ei-root">
    <MpBanner v-if="isImport && bannerOpen" id="ei-status-banner" variant="info" class="ei-banner">
      <MpBannerIcon id="ei-status-banner-icon" />
      <MpBannerTitle>{{ t('About import status') }}</MpBannerTitle>
      <MpBannerDescription>
        <ul class="ei-banner-list">
          <li><strong>{{ t('In queue:') }}</strong> {{ t('Please wait while your data is being processed.') }}</li>
          <li><strong>{{ t('In progress:') }}</strong> {{ t('This can take up to 24 hours. Check periodically by reloading the page or contact support if it exceeds 24 hours.') }}</li>
        </ul>
      </MpBannerDescription>
      <MpBannerCloseButton id="ei-status-banner-close" @click="bannerOpen = false" />
    </MpBanner>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :has-active-filter="hasActiveFilter"
      :bulk-label="isImport ? 'import file' : 'export file'"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="ei-feature" v-model="featureFilter" :placeholder="t('All features')" :options="featureOptions" width="200px" />
          <ErpFilterSelect id="ei-status" v-model="statusFilter" :placeholder="t('All status')" :options="statusOptions" width="176px" />
          <MpButton v-if="isImport" class="filter-all-btn" :class="{ 'filter-all-btn--active': activeDrawerFilter }" @click="openDrawer">
            <MpIcon name="filter" size="sm" />
            {{ t('Filter') }}
          </MpButton>
        </div>
        <div v-if="isImport" class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search file')" :aria-label="t('Search file')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
              <MpIcon name="close" size="sm" />
            </button>
          </div>
        </div>
      </template>

      <template #cell-createdAt="{ value }">{{ formatDateTime(value as string) }}</template>
      <template #cell-status="{ row }">
        <div class="ei-status">
          <ErpStatusBadge :status="String((row as Row).status)" :label="t(statusOf((row as Row).status as ImportStatus).label)" :type="statusOf((row as Row).status as ImportStatus).type" />
          <MpTooltip v-if="!isImport && (row as Row).status === 'email_failed'" :id="`ei-email-failed-${(row as Row).id}`" :label="t('Export file failed to be sent to email. Please check again your active email.')" placement="bottom" use-portal>
            <span class="ei-warn" tabindex="0" :aria-label="t('Failed to send email')"><MpIcon name="warning-circular" size="sm" /></span>
          </MpTooltip>
        </div>
      </template>
      <template #cell-fileName="{ row }">
        <span class="cell-link ei-filename" @click.stop="openDetail(row as unknown as ImportFile)">{{ (row as unknown as ImportFile).fileName }}</span>
      </template>
      <template #cell-feature="{ value }">{{ t(value as string) }}</template>
      <template #cell-successAmount="{ row }">{{ successCount(row as unknown as ImportFile) }}</template>

      <template #actions="{ row }">
        <template v-if="isImport">
          <MpTooltip v-if="canDelete(row as unknown as ImportFile)" :id="`ei-del-tt-${(row as Row).id}`" :label="t('Delete')" placement="bottom" use-portal>
            <MpButton variant="ghost" left-icon="delete" :aria-label="t('Delete')" is-rounded @click="askDelete(row as unknown as ImportFile)" />
          </MpTooltip>
        </template>
        <template v-else>
          <MpTooltip v-if="canDownload(row as unknown as ExportFile)" :id="`ei-dl-tt-${(row as Row).id}`" :label="t('Download')" placement="bottom" use-portal>
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Download')" is-rounded @click="infoToast(t('Not in this prototype'))" />
          </MpTooltip>
        </template>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No file yet') }}</p>
          <p class="empty-full-desc">{{ isImport ? t('Your import file list will appear here.') : t('Your export file list will appear here.') }}</p>
        </div>
      </template>
    </ErpTablePage>
  </div>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete import file?')"
    :description="`${t('After deleted,')} ${toDelete?.fileName ?? ''} ${t('cannot be restored.')}`"
    :confirm-label="t('Delete import file')"
    @confirm="confirmDelete"
  />

  <Teleport to="body">
    <Transition name="eif">
      <div v-if="drawerOpen" class="eif-overlay">
        <div class="eif-panel" role="dialog" :aria-label="t('Filter import list')">
          <header class="eif-header">
            <span class="eif-title">{{ t('Filter import list') }}</span>
            <MpButton class="eif-close" is-rounded :aria-label="t('Close')" @click="drawerOpen = false"><MpIcon name="close" size="md" /></MpButton>
          </header>
          <div class="eif-body">
            <div class="eif-field">
              <span class="eif-label">{{ t('Keywords') }}</span>
              <MpInput id="eif-keyword" v-model="draft.keyword" />
            </div>
            <div class="eif-row">
              <div class="eif-field">
                <span class="eif-label">{{ t('Start date') }}</span>
                <MpDatePicker id="eif-start" v-model="draft.start" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="draftError = false" />
              </div>
              <div class="eif-field">
                <span class="eif-label">{{ t('End date') }}</span>
                <MpDatePicker id="eif-end" v-model="draft.end" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="draftError = false" />
              </div>
            </div>
            <p v-if="draftError" class="eif-error">{{ t('End date must be after the start date') }}</p>
            <div class="eif-field">
              <span class="eif-label">{{ t('Feature') }}</span>
              <ErpFilterSelect id="eif-feature" v-model="draft.feature" :placeholder="t('All features')" :options="featureOptions" width="100%" />
            </div>
            <div class="eif-field">
              <span class="eif-label">{{ t('Status') }}</span>
              <ErpFilterSelect id="eif-status" v-model="draft.status" :placeholder="t('All status')" :options="statusOptions" width="100%" />
            </div>
          </div>
          <footer class="eif-footer">
            <MpButton variant="ghost" is-rounded @click="resetDraft">{{ t('Reset filter') }}</MpButton>
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="applyDrawer">{{ t('Apply') }}</MpButton>
            </MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ei-root { display: flex; flex-direction: column; gap: var(--mp-spacing-5); height: 100%; min-height: 0; }
.ei-banner { flex: none; }
.ei-banner-list { list-style: disc outside; margin: 0; padding-left: var(--mp-spacing-5); }
.ei-banner-list li { display: list-item; }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-all-btn {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.filter-all-btn--active { background: var(--mp-background-neutral-subtle) !important; color: var(--mp-text-selected, var(--mp-text-information)) !important; }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent; min-width: 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-text-subtle); }

.ei-status { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ei-warn { display: inline-flex; color: var(--mp-colors-text-warning); }
.ei-filename { white-space: normal; overflow-wrap: anywhere; }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.eif-enter-active, .eif-leave-active { transition: background-color 250ms ease; }
.eif-enter-from, .eif-leave-to { background-color: transparent; }
.eif-enter-active .eif-panel { transition: transform 350ms ease-out; }
.eif-leave-active .eif-panel { transition: transform 250ms ease-in; }
.eif-enter-from .eif-panel, .eif-leave-to .eif-panel { transform: translateX(calc(100% + 12px)); }
.eif-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.eif-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.eif-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.eif-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.eif-close { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default); }
.eif-close:hover { background: var(--mp-background-neutral-hovered); }
.eif-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }
.eif-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.eif-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.eif-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.eif-error { margin: calc(-1 * var(--mp-spacing-3)) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.eif-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
</style>
