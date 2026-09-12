<script setup lang="ts">
/**
 * CRM ▸ Settings ▸ Properties (/crm/settings/properties).
 *
 * The DEFAULT properties library — a read-only index of the predefined properties
 * every module gets (Deals + any custom module). No create action; each row has a
 * secondary "View details" button that opens a read-only drawer. Index format per
 * /pixel-erp-design: filter by field type (left) + search (right) + pagination.
 */
import { computed, ref } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import CrmPropertyDetailsDrawer from '~/components/patterns/CrmPropertyDetailsDrawer.vue'
import { DEFAULT_PROPERTIES, DEFAULT_PROPERTY_FIELD_TYPES, defaultPropertyIcon, type DefaultProperty } from '~/data/crm'

const { t } = useLocale()

const rows = computed<DefaultProperty[]>(() => DEFAULT_PROPERTIES)

const columns: TableColumn[] = [
  { key: 'name', label: 'Name', kind: 'name', sortable: true, sortType: 'text' },
  { key: 'fieldType', label: 'Field type', kind: 'status', sortable: true, sortType: 'text' },
  { key: 'view', label: '', isTrailingAction: true, width: '148px', noHeader: true, noSkeleton: true },
]

const fieldTypeOptions = DEFAULT_PROPERTY_FIELD_TYPES.map((ft) => ({ value: ft, label: ft }))

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<DefaultProperty>(rows, {
  filterFn: (row, s, status) =>
    (!s || row.name.toLowerCase().includes(s) || row.variableName.toLowerCase().includes(s))
    && (!status || row.fieldType === status),
  defaultSort: { key: 'name', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = '' }

// View-details drawer
const detailsOpen = ref(false)
const selected = ref<DefaultProperty | null>(null)
function viewDetails(p: DefaultProperty) { selected.value = p; detailsOpen.value = true }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Properties') }}</h1>
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <ErpTablePage
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        filter-empty-label="property"
        :search="search"
        :has-active-filter="hasActiveFilter"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect
              id="cpl-type-filter"
              :model-value="statusFilter"
              :placeholder="t('Field type')"
              :options="fieldTypeOptions"
              @update:model-value="(v: string) => (statusFilter = v)"
            />
          </div>
          <div class="filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search properties...')" />
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
            </div>
          </div>
        </template>

        <template #cell-name="{ row }">
          <span class="cell-text">{{ (row as unknown as DefaultProperty).name }}</span>
        </template>
        <template #cell-fieldType="{ row }">
          <span class="cpl-type">
            <MpIcon :name="defaultPropertyIcon((row as unknown as DefaultProperty).fieldType)" size="sm" class="cpl-type-icon" />
            {{ (row as unknown as DefaultProperty).fieldType }}
          </span>
        </template>
        <template #cell-view="{ row }">
          <MpButton class="btn-enterprise btn-enterprise--secondary" is-rounded @click="viewDetails(row as unknown as DefaultProperty)">{{ t('View details') }}</MpButton>
        </template>
      </ErpTablePage>
    </div>

    <CrmPropertyDetailsDrawer :open="detailsOpen" :property="selected" @close="detailsOpen = false" />
  </div>
</template>

<style scoped>
/* Shell — mirrors CrmModulesPage / CrmSettingsPage Teams surface. */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; }

.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: var(--mp-text-default); }
.cpl-type { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-default); }
.cpl-type-icon { color: var(--mp-icon-default, #536062); flex-shrink: 0; }

/* Filter bar (the .filter-search pill box + input are global in erp.css). */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
</style>
