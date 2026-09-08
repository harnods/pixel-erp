<script setup lang="ts">
/**
 * CRM ▸ Activity logs (/crm/activity).
 *
 * The ERP "Activity logs" table (Figma Other-Lists 4215-21752) contextualised for
 * CRM: DATE · USER · ACTIONS · FEATURE · NUMBER · DETAIL over `crmActivityLog`.
 * Features are CRM features and numbers use the "<Feature> #NNNNN" format; an EDIT
 * detail always reads old → new. A busy edit shows the first 3 detail lines with
 * View more/less (rule/activity-log-structure). Rows are read-only — no [...]
 * actions — so the table opts out of the hover highlight (rule/table-no-hover-no-actions).
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatDateTime } from '~/utils/date'
import {
  crmActivityLog, CRM_ACTIONS, CRM_ACTIVITY_FEATURES,
  type CrmActivityEntry, type CrmActivityDetail,
} from '~/data/crm'

const { t } = useLocale()

const rows = computed<CrmActivityEntry[]>(() => crmActivityLog)

const columns: TableColumn[] = [
  { key: 'date',    label: 'Date',    kind: 'date',   sortable: true, sortType: 'date' },
  { key: 'user',    label: 'User',    kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'action',  label: 'Actions', kind: 'status', sortable: true, sortType: 'text' },
  { key: 'feature', label: 'Feature', sortable: true, sortType: 'text' },
  { key: 'number',  label: 'Number',  kind: 'number' },
  { key: 'detail',  label: 'Detail',  kind: 'address' },
]

const actionOptions = CRM_ACTIONS.map((a) => ({ value: a, label: a }))
const featureOptions = CRM_ACTIVITY_FEATURES.map((f) => ({ value: f, label: f }))

// Filters — Actions select (statusFilter) + Feature select + search.
const featureFilter = ref('')
function detailText(d: CrmActivityDetail): string {
  return [d.label, d.from, d.to, d.text].filter(Boolean).join(' ').toLowerCase()
}

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<CrmActivityEntry>(rows, {
  filterFn: (row, s, status) => {
    const matchesSearch = !s
      || row.user.toLowerCase().includes(s)
      || row.feature.toLowerCase().includes(s)
      || (row.recordLabel?.toLowerCase().includes(s) ?? false)
      || row.action.toLowerCase().includes(s)
      || row.details.some((d) => detailText(d).includes(s))
    return matchesSearch
      && (!status || row.action === status)
      && (!featureFilter.value || row.feature === featureFilter.value)
  },
  defaultSort: { key: 'date', dir: 'desc' },
})
watch(featureFilter, () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value || !!featureFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = ''; featureFilter.value = '' }

// Detail cell — first 3 lines, View more/less (rule/activity-log-structure).
const expanded = reactive(new Set<string>())
function toggleExpand(id: string) { expanded.has(id) ? expanded.delete(id) : expanded.add(id) }
function visibleDetails(row: CrmActivityEntry): CrmActivityDetail[] {
  return expanded.has(row.id) ? row.details : row.details.slice(0, 3)
}
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">{{ t('Activity logs') }}</h1>
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
        filter-empty-label="activity"
        :search="search"
        :has-active-filter="hasActiveFilter"
        last-column-flexible
        no-row-hover
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <!-- Filter bar: Actions + Feature (left) · Search (right) -->
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="cal-action" :model-value="statusFilter" placeholder="Actions" :options="actionOptions" @update:model-value="(v: string) => (statusFilter = v)" />
            <ErpFilterSelect id="cal-feature" :model-value="featureFilter" placeholder="Feature" :options="featureOptions" @update:model-value="(v: string) => (featureFilter = v)" />
          </div>
          <div class="filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search activity')" />
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
            </div>
          </div>
        </template>

        <template #cell-date="{ row }">{{ formatDateTime((row as unknown as CrmActivityEntry).date) }}</template>
        <template #cell-user="{ row }">{{ (row as unknown as CrmActivityEntry).user }}</template>
        <template #cell-action="{ row }">{{ t((row as unknown as CrmActivityEntry).action) }}</template>
        <template #cell-feature="{ row }">
          <span v-if="(row as unknown as CrmActivityEntry).feature">{{ t((row as unknown as CrmActivityEntry).feature) }}</span>
          <span v-else class="al-muted">—</span>
        </template>
        <template #cell-number="{ row }">
          <NuxtLink v-if="(row as unknown as CrmActivityEntry).recordLink" class="cell-link" :to="(row as unknown as CrmActivityEntry).recordLink!">{{ (row as unknown as CrmActivityEntry).recordLabel }}</NuxtLink>
          <span v-else-if="(row as unknown as CrmActivityEntry).recordLabel">{{ (row as unknown as CrmActivityEntry).recordLabel }}</span>
          <span v-else class="al-muted">—</span>
        </template>

        <!-- Detail: labelled old → new edits or plain text; 3 lines + View more/less -->
        <template #cell-detail="{ row }">
          <div v-if="(row as unknown as CrmActivityEntry).details.length" class="al-details">
            <div v-for="(d, i) in visibleDetails(row as unknown as CrmActivityEntry)" :key="i" class="al-detail">
              <span v-if="d.label" class="al-detail-label">{{ t(d.label) }}</span>
              <span class="al-detail-value">
                <template v-if="d.from !== undefined || d.to !== undefined">{{ d.from }} <span class="al-arrow">→</span> {{ d.to }}</template>
                <template v-else>{{ d.text }}</template>
              </span>
            </div>
            <button
              v-if="(row as unknown as CrmActivityEntry).details.length > 3"
              type="button"
              class="al-more"
              @click="toggleExpand((row as unknown as CrmActivityEntry).id)"
            >
              {{ expanded.has((row as unknown as CrmActivityEntry).id)
                ? t('View less')
                : `+${(row as unknown as CrmActivityEntry).details.length - 3} ${t('more')}` }}
            </button>
          </div>
          <span v-else class="al-muted">—</span>
        </template>
      </ErpTablePage>
    </div>
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.crm-titlebar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.crm-titlebar__left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default, #272b32); }
.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; }

/* Filter bar (the .filter-search pill box + input come from erp.css). */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-4-5, 18px) !important; height: var(--mp-sizes-4-5, 18px) !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }

/* Link + muted */
.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.al-muted { color: var(--mp-text-secondary); }

/* Detail cell */
.al-details { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.al-detail { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.al-detail-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.al-detail-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: normal; overflow-wrap: anywhere; }
.al-arrow { color: var(--mp-text-secondary); padding: 0 var(--mp-spacing-0\.5); }
.al-more { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.al-more:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
