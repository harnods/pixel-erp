<script setup lang="ts">
/**
 * Other lists ▸ Activity log (Figma Other-Lists 4215-21752).
 *
 * The same table the CRM already ships (`CrmActivityLogPage.vue`, same Figma
 * node), contextualised for the ERP: DATE · USER · ACTIONS · FEATURE · NUMBER ·
 * DETAIL over `activityLog`. An update detail reads old → new; a busy entry
 * shows the first 3 lines plus a "+N more" toggle (rule/activity-log-structure).
 * Rows are read-only — no [...] actions — so the table opts out of the hover
 * highlight (rule/table-no-hover-no-actions).
 *
 * Filter bar: Actions + Feature + All filters (left) · Search (right). "All
 * filters" opens a drawer with a Date range and a User filter, the same pair the
 * CRM page offers. No title-bar button: there is nothing to create here.
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ErpTagComparatorField, { type TagComparator } from '~/components/patterns/ErpTagComparatorField.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import { formatDateTime } from '~/utils/date'
import {
  activityLog, activityFeatures, activityUsers, ACTIVITY_ACTIONS,
  type ActivityEntry, type ActivityDetail,
} from '~/data'

const { t } = useLocale()
const toggleAirene = inject<() => void>('toggleAirene')

const previewMode = ref('Default')
const rows = computed<ActivityEntry[]>(() => (previewMode.value === 'Empty state' ? [] : activityLog))

const columns: TableColumn[] = [
  { key: 'date',    label: t('Date'),    kind: 'datetime', sortable: true, sortType: 'date' },
  { key: 'user',    label: t('User'),    kind: 'name',     sortable: true, sortType: 'text' },
  { key: 'action',  label: t('Actions'), kind: 'status',   sortable: true, sortType: 'text' },
  { key: 'feature', label: t('Feature'),                   sortable: true, sortType: 'text' },
  { key: 'number',  label: t('Number'),  kind: 'number' },
  { key: 'detail',  label: t('Detail'),  kind: 'address' },
]

const actionOptions = ACTIVITY_ACTIONS.map(a => ({ value: a, label: t(a) }))
const featureOptions = computed(() => activityFeatures().map(f => ({ value: f, label: t(f) })))
const userOptions = computed(() => activityUsers())

// ── Applied filters — Actions (statusFilter) + Feature + search + drawer ────
const featureFilter = ref('')
const dateRange = ref<Date[] | null>(null)
const users = ref<string[]>([])
const userCmp = ref<TagComparator>('isAnyOf')

function detailText(d: ActivityDetail): string {
  return [d.label, d.from, d.to, d.text].filter(Boolean).join(' ').toLowerCase()
}
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function matchesDate(iso: string): boolean {
  if (!dateRange.value) return true
  const x = dayStart(new Date(iso)).getTime()
  return x >= dayStart(dateRange.value[0]!).getTime() && x <= dayStart(dateRange.value[1]!).getTime()
}
function matchesUser(user: string): boolean {
  if (users.value.length === 0) return true
  if (userCmp.value === 'isNoneOf') return !users.value.includes(user)
  if (userCmp.value === 'isAllOf') return users.value.every(u => u === user)
  return users.value.includes(user) // isAnyOf
}

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<ActivityEntry>(rows, {
  filterFn: (row, s, status) => {
    const matchesSearch = !s
      || row.user.toLowerCase().includes(s)
      || row.feature.toLowerCase().includes(s)
      || (row.recordLabel?.toLowerCase().includes(s) ?? false)
      || row.action.toLowerCase().includes(s)
      || row.details.some(d => detailText(d).includes(s))
    return matchesSearch
      && (!status || row.action === status)
      && (!featureFilter.value || row.feature === featureFilter.value)
      && matchesDate(row.date)
      && matchesUser(row.user)
  },
  defaultSort: { key: 'date', dir: 'desc' },
})
watch([featureFilter, dateRange, users, userCmp], () => setPage(1))

// ── All-filters drawer (Date + User) — edits a draft; applies on Apply ──────
const filtersOpen = ref(false)
const draftDate = ref<Date[] | null>(null)
const draftUsers = ref<string[]>([])
const draftUserCmp = ref<TagComparator>('isAnyOf')
const activeFilterCount = computed(() => (dateRange.value ? 1 : 0) + (users.value.length ? 1 : 0))
function openFilters() {
  draftDate.value = dateRange.value ? [...dateRange.value] : null
  draftUsers.value = [...users.value]
  draftUserCmp.value = userCmp.value
  filtersOpen.value = true
}
function resetFilters() { draftDate.value = null; draftUsers.value = []; draftUserCmp.value = 'isAnyOf' }
function applyFilters() {
  dateRange.value = draftDate.value ? [...draftDate.value] : null
  users.value = [...draftUsers.value]
  userCmp.value = draftUserCmp.value
  filtersOpen.value = false
}

const hasActiveFilter = computed(() =>
  !!search.value || !!statusFilter.value || !!featureFilter.value || activeFilterCount.value > 0)
function clearFilters() {
  search.value = ''; statusFilter.value = ''; featureFilter.value = ''
  dateRange.value = null; users.value = []; userCmp.value = 'isAnyOf'
}

// ── Detail cell — first 3 lines, +N more (rule/activity-log-structure) ──────
const expanded = reactive(new Set<string>())
function toggleExpand(id: string) { expanded.has(id) ? expanded.delete(id) : expanded.add(id) }
function visibleDetails(row: ActivityEntry): ActivityDetail[] {
  return expanded.has(row.id) ? row.details : row.details.slice(0, 3)
}
</script>

<template>
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
    no-row-hover
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar: Actions + Feature + All filters | search ── -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect
          id="al-action"
          :model-value="statusFilter"
          :placeholder="t('Actions')"
          :options="actionOptions"
          @update:model-value="(v: string) => (statusFilter = v)"
        />
        <ErpFilterSelect
          id="al-feature"
          :model-value="featureFilter"
          :placeholder="t('Feature')"
          :options="featureOptions"
          @update:model-value="(v: string) => (featureFilter = v)"
        />
        <MpButton
          class="filter-all-btn"
          :class="{ 'filter-all-btn--active': activeFilterCount > 0 }"
          data-devchange="activity-log-index"
          @click="openFilters"
        >
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}
        </MpButton>
      </div>
      <div class="filter-right">
        <MpTooltip :label="t('Ask Airene')" placement="bottom">
          <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
        </MpTooltip>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search activity')" />
          <MpButton v-if="search" class="search-clear-btn" variant="ghost" type="button" :aria-label="t('Clear search')" left-icon="close" @click="search = ''" />
        </div>
      </div>
    </template>

    <template #cell-date="{ row }">{{ formatDateTime((row as unknown as ActivityEntry).date) }}</template>
    <template #cell-user="{ row }">{{ (row as unknown as ActivityEntry).user }}</template>
    <template #cell-action="{ row }">{{ t((row as unknown as ActivityEntry).action) }}</template>

    <template #cell-feature="{ row }">
      <span v-if="(row as unknown as ActivityEntry).feature">{{ t((row as unknown as ActivityEntry).feature) }}</span>
      <span v-else class="al-muted">—</span>
    </template>

    <!-- Number: linked to the module index where one exists; the Figma's
         numbers aren't ids from the real stores, so a per-record route
         would 404. Modules with no route at all render as plain text. -->
    <template #cell-number="{ row }">
      <NuxtLink
        v-if="(row as unknown as ActivityEntry).recordLink"
        class="cell-link"
        :to="(row as unknown as ActivityEntry).recordLink!"
      >{{ (row as unknown as ActivityEntry).recordLabel }}</NuxtLink>
      <span v-else-if="(row as unknown as ActivityEntry).recordLabel">{{ (row as unknown as ActivityEntry).recordLabel }}</span>
      <span v-else class="al-muted">—</span>
    </template>

    <!-- Detail: labelled old → new edits or plain text; 3 lines + "+N more" -->
    <template #cell-detail="{ row }">
      <div v-if="(row as unknown as ActivityEntry).details.length" class="al-details">
        <div v-for="(d, i) in visibleDetails(row as unknown as ActivityEntry)" :key="i" class="al-detail">
          <span v-if="d.label" class="al-detail-label">{{ t(d.label) }}</span>
          <span class="al-detail-value">
            <template v-if="d.from !== undefined || d.to !== undefined">{{ d.from }} <span class="al-arrow">→</span> {{ d.to }}</template>
            <template v-else>{{ d.text }}</template>
          </span>
        </div>
        <MpButton
          v-if="(row as unknown as ActivityEntry).details.length > 3"
          type="button"
          variant="link"
          class="al-more"
          @click="toggleExpand((row as unknown as ActivityEntry).id)"
        >
          {{ expanded.has((row as unknown as ActivityEntry).id)
            ? t('View less')
            : `+${(row as unknown as ActivityEntry).details.length - 3} ${t('more')}` }}
        </MpButton>
      </div>
      <span v-else class="al-muted">—</span>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <p class="empty-full-title">{{ t('No activity yet') }}</p>
        <p class="empty-full-desc">{{ t('Everything people do in this account will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── All filters drawer (Date + User) ── -->
  <ErpDrawer :is-open="filtersOpen" :title="t('All filters')" @close="filtersOpen = false">
    <template #body>
      <div class="alf-field">
        <span class="alf-field-label">{{ t('Date') }}</span>
        <AdvancedDateRangePicker
          id="al-daterange"
          :model-value="draftDate"
          is-full-width
          hide-label
          :placeholder="t('Select date')"
          @update:model-value="draftDate = $event"
        />
      </div>
      <div class="alf-field">
        <span class="alf-field-label">{{ t('User') }}</span>
        <ErpTagComparatorField
          id="al-user"
          :comparator="draftUserCmp"
          :values="draftUsers"
          :options="userOptions"
          :comparators="['isAnyOf', 'isAllOf', 'isNoneOf']"
          :placeholder="t('Type a name…')"
          @update:comparator="draftUserCmp = $event"
          @update:values="draftUsers = $event"
        />
      </div>
    </template>
    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="resetFilters">{{ t('Reset filter') }}</MpButton>
      <div class="alf-footer-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="filtersOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="applyFilters">{{ t('Apply') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>

  <ScenarioFab v-model="previewMode" />
</template>

<style scoped>
/* Link + muted */
.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.al-muted { color: var(--mp-text-secondary); }

/* Detail cell — one stacked block per changed field. */
.al-details { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.al-detail { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.al-detail-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.al-detail-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: normal; overflow-wrap: anywhere; }
.al-arrow { color: var(--mp-text-secondary); padding: 0 var(--mp-spacing-1, 4px); }
.al-more { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.al-more:hover { text-decoration: underline; text-underline-offset: 2px; }

/* All-filters drawer body fields (shell comes from ErpDrawer). */
.alf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.alf-field + .alf-field { margin-top: var(--mp-spacing-5, 20px); }
.alf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.alf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
