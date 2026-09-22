<script setup lang="ts">
/**
 * CRM ▸ Settings ▸ Modules settings (/crm/settings/modules).
 *
 * The "Customizable CRM Platform" index (PRD: ERP - Customizable CRM Platform and
 * Deals V1, §6.3). A management table of the Deals SYSTEM module plus any custom
 * modules — module name, access level, records, ERP conversion target, status and
 * last update. Manage opens the module builder (/crm/settings/modules/:id) where
 * fields, layout, stages and saved views are configured.
 *
 * Full-bleed CRM settings page: owns its `.detail-bar` title bar + scrollable
 * `.detail-stage`, mirroring the Teams page so every Settings surface matches.
 */
import { computed, reactive, ref, watch } from 'vue'
import {
  MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  MpModal, MpModalHeader, MpModalContent, MpModalBody, MpModalFooter, MpModalCloseButton,
  MpButtonGroup, MpInput, MpFormControl, MpFormLabel, MpFormErrorMessage, MpRadio,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { crmModules, type CrmModule, CRM_CONVERSION_LABELS, genericRecordsFor, canEditModule } from '~/data/crm'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

function soon(what: string) { infoToast(`${what} — coming soon`) }
function manage(m: CrmModule) { router.push(`/crm/settings/modules/${m.id}`) }

// ── New module creation modal ────────────────────────────────────────────────
const newModuleOpen = ref(false)
const newModuleName = ref('')
const newModuleAccess = ref<'company' | 'team'>('company')
const newModuleNameError = ref('')

function openNewModule() {
  newModuleName.value = ''
  newModuleAccess.value = 'company'
  newModuleNameError.value = ''
  newModuleOpen.value = true
}
function continueNewModule() {
  newModuleNameError.value = ''
  if (!newModuleName.value.trim()) { newModuleNameError.value = t('Enter a module name.'); return }
  newModuleOpen.value = false
  router.push({ path: '/crm/settings/modules/new', query: { name: newModuleName.value.trim(), accessLevel: newModuleAccess.value } })
}

type ModuleRow = CrmModule & { access: string; conversionLabel: string }
// The Modules index lists EVERY module — the Deals system module (edited via its
// Pipeline/Layout builder) plus any custom modules.
const rows = computed<ModuleRow[]>(() =>
  crmModules.map((m) => ({
    ...m,
    // Generic custom modules (any id besides the hand-built 'deals'/'services')
    // keep their own live record count instead of the static seeded field.
    recordCount: (!m.system && m.id !== 'services') ? genericRecordsFor(m.id).length : m.recordCount,
    access: m.accessLevel === 'company' ? 'Company' : 'Team',
    conversionLabel: m.conversionTarget ? CRM_CONVERSION_LABELS[m.conversionTarget] : '—',
  })),
)

const columns: TableColumn[] = [
  { key: 'name',        label: 'Module',       kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'access',      label: 'Access level', kind: 'status',                 sortType: 'text'   },
  { key: 'recordCount', label: 'Records',      kind: 'number', sortable: true, sortType: 'number' },
  { key: 'conversion',  label: 'ERP conversion', kind: 'status'                                    },
  { key: 'status',      label: 'Status',       kind: 'status', sortable: true, sortType: 'text'   },
  { key: 'updatedAt',   label: 'Last updated', kind: 'date',   sortable: true, sortType: 'date'   },
]

// Status badge: published=green, draft=gray.
const STATUS_BADGE: Record<string, { status: string; label: string }> = {
  published:  { status: 'active',  label: 'Published' },
  draft:      { status: 'draft',   label: 'Draft' },
}
function statusBadge(s: string): { status: string; label: string } {
  return STATUS_BADGE[s] ?? { status: 'draft', label: s }
}

const statusFilterOptions = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
]

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<ModuleRow>(rows, {
  filterFn: (row, s, status) =>
    (!s || row.name.toLowerCase().includes(s))
    && (!status || row.status === status),
  defaultSort: { key: 'updatedAt', dir: 'desc' },
})
const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = '' }

const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }
watch(statusFilter, () => setPage(1))
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Modules') }}</h1>
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpButton variant="primary" is-rounded left-icon="add" @click="openNewModule">{{ t('New module') }}</MpButton>
      </div>
    </header>

    <div class="detail-stage">
      <ErpTablePage
        :columns="visibleColumns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        filter-empty-label="module"
        :search="search"
        :has-active-filter="hasActiveFilter"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @hide-column="hideColumn"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect
              id="cmm-status-filter"
              :model-value="statusFilter"
              placeholder="Status"
              :options="statusFilterOptions"
              @update:model-value="(v: string) => (statusFilter = v)"
            />
          </div>
          <div class="filter-right">
            <div class="filter-btn-group">
              <ColumnSettingsMenu id="cmm-columns" :items="columnItems" :visibility="columnVisibility" />
            </div>
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
            </div>
          </div>
        </template>

        <!-- Module name + system/custom caption. Only the admin (workspace owner)
             and the module's own creator can open it — everyone else sees plain text. -->
        <template #cell-name="{ row }">
          <div class="cru-name">
            <span
              v-if="canEditModule(row as unknown as ModuleRow)" class="cell-link cell-text"
              @click.stop="manage(row as unknown as ModuleRow)"
            >{{ (row as unknown as ModuleRow).name }}</span>
            <span v-else class="cell-text">{{ (row as unknown as ModuleRow).name }}</span>
            <span class="cru-email">{{ (row as unknown as ModuleRow).system ? t('System module') : t('Custom module') }}</span>
          </div>
        </template>
        <template #cell-access="{ row }">{{ t((row as unknown as ModuleRow).access) }}</template>
        <template #cell-recordCount="{ row }">
          {{ (row as unknown as ModuleRow).recordCount }} {{ (row as unknown as ModuleRow).recordCount !== 1 ? t('records') : t('record') }}
        </template>
        <template #cell-conversion="{ row }">
          <span :class="{ 'cmm-muted': (row as unknown as ModuleRow).conversionLabel === '—' }">{{ (row as unknown as ModuleRow).conversionLabel }}</span>
        </template>
        <template #cell-status="{ row }">
          <ErpStatusBadge :status="statusBadge((row as unknown as ModuleRow).status).status" :label="t(statusBadge((row as unknown as ModuleRow).status).label)" />
        </template>
        <template #cell-updatedAt="{ row }">
          <LastUpdatedCell :at="(row as unknown as ModuleRow).updatedAt" :by="(row as unknown as ModuleRow).updatedBy" />
        </template>

        <!-- Actions: Manage / (custom) Delete -->
        <template #actions="{ row }">
          <MpPopover :id="`cmm-actions-${(row as unknown as ModuleRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem v-if="canEditModule(row as unknown as ModuleRow)" @click="manage(row as unknown as ModuleRow)">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="!(row as unknown as ModuleRow).system" @click="soon(t('Delete module'))">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
      </ErpTablePage>
    </div>

    <!-- New module creation modal -->
    <MpModal id="crm-new-module-modal" :is-open="newModuleOpen" :is-close-on-esc="false" :is-close-on-overlay-click="false" :is-keep-alive="false" size="sm" @close="newModuleOpen = false" data-devchange="crm-new-module-modal">
      <MpModalHeader>
        {{ t('New module') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalContent>
        <MpModalBody>
          <div class="nmm-fields">
            <MpFormControl id="nmm-name-fc">
              <MpFormLabel>{{ t('Module name') }}</MpFormLabel>
              <MpInput id="nmm-name" v-model="newModuleName" :placeholder="t('e.g. Projects, Tickets')" is-full-width :is-invalid="!!newModuleNameError" @keydown.enter="continueNewModule" />
              <MpFormErrorMessage v-if="newModuleNameError">{{ newModuleNameError }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="nmm-access-fc">
              <MpFormLabel>{{ t('Access level') }}</MpFormLabel>
              <div class="nmm-radio-row">
                <MpRadio id="nmm-access-company" name="nmm-access" value="company" :is-checked="newModuleAccess === 'company'" @change="newModuleAccess = 'company'">{{ t('Company') }}</MpRadio>
                <MpRadio id="nmm-access-team" name="nmm-access" value="team" :is-checked="newModuleAccess === 'team'" @change="newModuleAccess = 'team'">{{ t('Team') }}</MpRadio>
              </div>
            </MpFormControl>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="newModuleOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="continueNewModule">{{ t('Continue') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
    </MpModal>
  </div>
</template>

<style scoped>

/* Shell — mirrors CrmSettingsPage's Teams surface exactly. */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; }

/* Name cell — link over a caption. */
.cru-name { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cru-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cmm-muted { color: var(--mp-text-secondary); }
.cru-action--danger :deep(*), .cru-action--danger { color: var(--mp-colors-text-danger, #a8352d); }

.row-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }

/* Filter bar (the .filter-search pill box + input are global in erp.css). */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }

/* New module modal */
.nmm-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }
.nmm-radio-row { display: flex; align-items: center; gap: var(--mp-spacing-6, 24px); margin-top: var(--mp-spacing-1, 4px); }
</style>
