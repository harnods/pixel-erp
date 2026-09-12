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
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButtonGroup, MpFormControl, MpFormLabel, MpInput, MpRadio, MpCheckbox,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  crmModules, type CrmModule, CRM_CONVERSION_LABELS,
  CRM_MODULE_ICONS, createCustomModule, genericRecordsFor, crmTeams,
} from '~/data/crm'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

function soon(what: string) { infoToast(`${what} — coming soon`) }
function manage(m: CrmModule) { router.push(`/crm/settings/modules/${m.id}`) }

// ── "+ New module" — creates a real, functional custom module (its own
//    Setup/Properties/Pipeline/Layout config + records workspace) and opens the
//    builder immediately so the user can configure it. ──────────────────────────
const MODULE_NAME_MAX = 40
const newModuleOpen = ref(false)
const newModuleName = ref('')
const newModuleIcon = ref('pipeline')
const newModuleError = ref('')
const newModuleIconMenuOpen = ref(false)
const newModuleAccessLevel = ref<'company' | 'team'>('company')
const newModuleTeamIds = ref<string[]>([])
const activeTeams = computed(() => crmTeams.filter((t) => t.status === 'active'))
function toggleNewModuleTeam(id: string) {
  newModuleTeamIds.value = newModuleTeamIds.value.includes(id)
    ? newModuleTeamIds.value.filter((x) => x !== id)
    : [...newModuleTeamIds.value, id]
}
function openNewModule() {
  newModuleName.value = ''; newModuleIcon.value = 'pipeline'; newModuleError.value = ''; newModuleIconMenuOpen.value = false
  newModuleAccessLevel.value = 'company'; newModuleTeamIds.value = []
  newModuleOpen.value = true
}
function pickNewModuleIcon(icon: string) { newModuleIcon.value = icon; newModuleIconMenuOpen.value = false }
function submitNewModule() {
  if (!newModuleName.value.trim()) { newModuleError.value = t('Enter a module name.'); return }
  if (newModuleAccessLevel.value === 'team' && !newModuleTeamIds.value.length) { newModuleError.value = t('Select at least one team.'); return }
  const id = createCustomModule(newModuleName.value.trim(), newModuleIcon.value, newModuleAccessLevel.value, newModuleTeamIds.value)
  newModuleOpen.value = false
  router.push(`/crm/settings/modules/${id}`)
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

// Status badge: published=green, draft=gray, incomplete=yellow.
const STATUS_BADGE: Record<string, { status: string; label: string }> = {
  published:  { status: 'active',  label: 'Published' },
  draft:      { status: 'draft',   label: 'Draft' },
  incomplete: { status: 'pending', label: 'Incomplete' },
}
function statusBadge(s: string): { status: string; label: string } {
  return STATUS_BADGE[s] ?? { status: 'draft', label: s }
}

const statusFilterOptions = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'incomplete', label: 'Incomplete' },
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

        <!-- Module name + system/custom caption -->
        <template #cell-name="{ row }">
          <div class="cru-name">
            <span class="cell-link cell-text" @click.stop="manage(row as unknown as ModuleRow)">{{ (row as unknown as ModuleRow).name }}</span>
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
                <MpPopoverListItem @click="manage(row as unknown as ModuleRow)">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="!(row as unknown as ModuleRow).system" @click="soon(t('Delete module'))">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
      </ErpTablePage>
    </div>

    <!-- New module — name + icon; on create, opens straight into its builder. -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="new-module-modal" :is-open="newModuleOpen" :is-keep-alive="false" size="sm" @close="newModuleOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('New module') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <MpFormControl id="new-module-name-fc">
            <MpFormLabel>{{ t('Module name') }}</MpFormLabel>
            <div class="nmm-name-row">
              <MpPopover id="new-module-icon-menu" :is-open="newModuleIconMenuOpen" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start" @close="newModuleIconMenuOpen = false">
                <MpPopoverTrigger>
                  <button type="button" class="nmm-icon-trigger" :aria-label="t('Change icon')" @click="newModuleIconMenuOpen = !newModuleIconMenuOpen">
                    <MpIcon :name="newModuleIcon" size="md" />
                    <MpIcon name="chevrons-down" size="sm" class="nmm-icon-caret" />
                  </button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ padding: 'var(--mp-spacing-2)', width: '240px' })">
                  <div class="nmm-icon-grid">
                    <button
                      v-for="ic in CRM_MODULE_ICONS" :key="ic" type="button"
                      class="nmm-icon-choice" :class="{ 'nmm-icon-choice--active': newModuleIcon === ic }"
                      :aria-label="ic" @click="pickNewModuleIcon(ic)"
                    ><MpIcon :name="ic" size="md" /></button>
                  </div>
                </MpPopoverContent>
              </MpPopover>
              <MpInput
                id="new-module-name" v-model="newModuleName" is-full-width :maxlength="MODULE_NAME_MAX"
                @update:model-value="newModuleError = ''" @keydown.enter="submitNewModule"
              />
            </div>
          </MpFormControl>

          <MpFormControl id="new-module-access-fc" class="nmm-access-fc">
            <MpFormLabel>{{ t('Access level') }}</MpFormLabel>
            <div class="nmm-radio-row">
              <MpRadio id="nmm-access-company" name="nmm-access" value="company" :is-checked="newModuleAccessLevel === 'company'" @change="newModuleAccessLevel = 'company'">{{ t('Company') }}</MpRadio>
              <MpRadio id="nmm-access-team" name="nmm-access" value="team" :is-checked="newModuleAccessLevel === 'team'" @change="newModuleAccessLevel = 'team'">{{ t('Team') }}</MpRadio>
            </div>
            <div v-if="newModuleAccessLevel === 'team'" class="nmm-team-list">
              <MpCheckbox
                v-for="tm in activeTeams" :key="tm.id" :id="`nmm-team-${tm.id}`"
                :is-checked="newModuleTeamIds.includes(tm.id)" @change="toggleNewModuleTeam(tm.id)"
              >{{ tm.name }}</MpCheckbox>
              <p v-if="!activeTeams.length" class="nmm-team-empty">{{ t('No active teams yet.') }}</p>
            </div>
          </MpFormControl>

          <p v-if="newModuleError" class="nmm-error">{{ newModuleError }}</p>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup class="erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="newModuleOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="submitNewModule">{{ t('Create module') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
/* New module modal — name field with an icon-picker prefix (mirrors the module
   builder's Setup ▸ Module name icon trigger). */
.nmm-name-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.nmm-icon-trigger { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; padding: var(--mp-spacing-2); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral, #fff); cursor: pointer; color: var(--mp-text-default); }
.nmm-icon-trigger:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.nmm-icon-caret { color: var(--mp-icon-default, #536062); }
.nmm-icon-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-1); }
.nmm-icon-choice { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: var(--mp-radii-sm); background: none; cursor: pointer; color: var(--mp-icon-default, #536062); }
.nmm-icon-choice:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.nmm-icon-choice--active { background: var(--mp-background-brand-subtle, #eafaf1); color: var(--mp-icon-brand, #0a6e4e); }
.nmm-error { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #a8352d); }
.nmm-access-fc { margin-top: var(--mp-spacing-5); }
.nmm-radio-row { display: flex; align-items: center; gap: var(--mp-spacing-5); }
.nmm-team-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 8px; max-height: 180px; overflow-y: auto; }
.nmm-team-empty { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

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
</style>
