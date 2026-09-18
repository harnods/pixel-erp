<script setup lang="ts">
/**
 * CRM ▸ Settings ▸ ERP Integration Settings — list (/crm/settings/erp-integrations).
 *
 * PRD "ERP Transaction Conversion Settings V1" §Product Design → ERP Integration
 * Settings list. One row per eligible module (Deals system module + custom modules);
 * shows whether conversion is enabled, the single ERP target, mapping readiness, and
 * when it was last validated. Manage opens the module integration editor.
 *
 * Status is conveyed by badge TEXT (never colour alone), per the PRD accessibility
 * requirement. There is deliberately NO Default AR card, NO Expense option, and NO
 * trigger-timing column — those are all out of scope / forbidden by the PRD.
 *
 * Full-bleed CRM settings page: owns its `.detail-bar` + scrollable `.detail-stage`,
 * mirroring CrmModulesPage so every Settings surface matches.
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { crmModules, type CrmModule } from '~/data/crm'
import {
  getConversionConfig, configState, CONFIG_STATE_SHORT, CONV_TARGET_LABEL,
  readinessCounts, type ConfigState, type ConversionConfig,
} from '~/data/crmConversion'

const { t } = useLocale()
const router = useRouter()

function manage(id: string) { router.push(`/crm/settings/erp-integrations/${id}`) }

// MpBadge type per config state (text carries the meaning; colour reinforces it).
const STATE_BADGE_TYPE: Record<ConfigState, 'completed' | 'critical' | 'warning' | 'information' | 'announcement'> = {
  ready: 'completed',
  'needs-attention': 'critical',
  'needs-revalidation': 'warning',
  'disabled-valid': 'information',
  'disabled-incomplete': 'announcement',
  'not-configured': 'announcement',
  'module-inactive': 'announcement',
}

interface IntegrationRow {
  id: string
  name: string
  system: boolean
  moduleStatus: CrmModule['status']
  enabled: boolean
  targetLabel: string
  state: ConfigState
  readinessLabel: string
  updatedAt: string
  updatedBy: string
  cfg?: ConversionConfig
}

// Only PUBLISHED modules are eligible for ERP conversion (a draft/incomplete module
// has no stable published schema to map against).
const rows = computed<IntegrationRow[]>(() =>
  crmModules.filter((m) => m.status === 'published').map((m) => {
    const cfg = getConversionConfig(m.id)
    const state = cfg ? configState(cfg) : 'not-configured'
    const rc = cfg ? readinessCounts(cfg) : null
    return {
      id: m.id,
      name: m.name,
      system: m.system,
      moduleStatus: m.status,
      enabled: !!cfg?.enabled,
      targetLabel: cfg ? CONV_TARGET_LABEL[cfg.target] : '—',
      state,
      readinessLabel: rc ? `${rc.mappedRequired}/${rc.totalRequired} required` : '—',
      updatedAt: cfg?.lastSavedAt ?? m.updatedAt,
      updatedBy: cfg?.lastSavedBy ?? m.updatedBy,
      cfg,
    }
  }),
)

// Widths are set explicitly per the task owner's spec (authority: explicit user
// goal > rule/table-column-standard). A flexible spacer after Last updated pushes
// the sticky [Manage] actions column flush right.
const columns: TableColumn[] = [
  { key: 'name',      label: 'Module',               width: '200px', sortable: true, sortType: 'text' },
  { key: 'enabled',   label: 'Conversion status',    width: '160px'                                    },
  { key: 'target',    label: 'ERP transaction type', width: '200px'                                    },
  { key: 'state',     label: 'Mapping readiness',    width: '160px', sortable: true, sortType: 'text' },
  { key: 'readiness', label: 'Mapped fields',        width: '160px'                                    },
  { key: 'updatedAt', label: 'Last updated',         kind: 'date',   sortable: true, sortType: 'date' },
]

const enabledFilterOptions = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<IntegrationRow>(rows, {
  // statusFilter drives the Enabled/Disabled status filter.
  filterFn: (row, s, enabled) =>
    (!s || row.name.toLowerCase().includes(s))
    && (!enabled || (enabled === 'enabled' ? row.enabled : !row.enabled)),
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
          <h1 class="detail-title" data-devchange="crm-erp-conversion-settings">{{ t('ERP integrations') }}</h1>
        </div>
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
        actions-width="120px"
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
              id="cei-status-filter"
              :model-value="statusFilter"
              placeholder="Status"
              :options="enabledFilterOptions"
              @update:model-value="(v: string) => (statusFilter = v)"
            />
          </div>
          <div class="filter-right">
            <div class="filter-btn-group">
              <ColumnSettingsMenu id="cei-columns" :items="columnItems" :visibility="columnVisibility" />
            </div>
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
            </div>
          </div>
        </template>

        <template #cell-name="{ row }">
          <div class="cru-name">
            <span class="cell-link cell-text" @click.stop="manage((row as unknown as IntegrationRow).id)">{{ (row as unknown as IntegrationRow).name }}</span>
            <span class="cru-email">{{ (row as unknown as IntegrationRow).system ? t('System module') : t('Custom module') }}</span>
          </div>
        </template>
        <template #cell-enabled="{ row }">
          <ErpStatusBadge
            :type="(row as unknown as IntegrationRow).enabled ? 'completed' : 'announcement'"
            :label="(row as unknown as IntegrationRow).enabled ? t('Enabled') : t('Disabled')"
          />
        </template>
        <template #cell-target="{ row }">
          <span :class="{ 'cei-muted': (row as unknown as IntegrationRow).targetLabel === '—' }">{{ (row as unknown as IntegrationRow).targetLabel }}</span>
        </template>
        <template #cell-state="{ row }">
          <ErpStatusBadge
            :type="STATE_BADGE_TYPE[(row as unknown as IntegrationRow).state]"
            :label="t(CONFIG_STATE_SHORT[(row as unknown as IntegrationRow).state])"
          />
        </template>
        <template #cell-readiness="{ row }">
          <span :class="{ 'cei-muted': (row as unknown as IntegrationRow).readinessLabel === '—' }">{{ (row as unknown as IntegrationRow).readinessLabel }}</span>
        </template>
        <template #cell-updatedAt="{ row }">
          <LastUpdatedCell :at="(row as unknown as IntegrationRow).updatedAt" :by="(row as unknown as IntegrationRow).updatedBy" />
        </template>

        <template #actions="{ row }">
          <button class="btn-enterprise btn-enterprise--secondary" type="button" @click.stop="manage((row as unknown as IntegrationRow).id)">{{ t('Manage') }}</button>
        </template>
      </ErpTablePage>
    </div>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
/* padding-top gives the filter-bar select a few px of breathing room so its top
   border / focus ring doesn't land on the scroll box's clip edge and get shaved. */
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-1) var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; }

.cru-name { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cru-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cei-muted { color: var(--mp-text-secondary); }

/* The shared table top-aligns the actions cell (for kebabs on tall rows); this
   table's rows are two lines (module + type caption), so centre the [Manage]
   button vertically instead. */
:deep(.erp-td--actions) { vertical-align: middle; padding-top: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-2); }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.search-clear-btn { display: inline-flex !important; align-items: center; justify-content: center; flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important; border: none !important; background: none !important; cursor: pointer; color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important; }
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
</style>
