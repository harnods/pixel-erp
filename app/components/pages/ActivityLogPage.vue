<!-- prod-parity: quickbook/app/views/audits/index.html.haml (+ _table, _filter_popovers) -->
<script setup lang="ts">
/**
 * Other lists → Activity log (prod "Audits"). Columns: Date · Action · Type ·
 * Number · User · Details. Prod filters Date (start/end, max 1 month), Action
 * and User from header popovers; here they sit in the filter bar. Times are
 * GMT+7.
 */
import { MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import { formatDateTime } from '~/utils/date'
import { auditEntries, type AuditEntry } from '~/data/otherLists'

const { t } = useLocale()

const actionFilter = ref('')
const userFilter = ref('')
const dateRange = ref<Date[] | null>(null)
const dateError = ref(false)

const actionOptions = [...new Set(auditEntries.map((a) => a.action))].map((a) => ({ value: a, label: t(a) }))
const userOptions = [...new Set(auditEntries.map((a) => a.user))].sort().map((u) => ({ value: u, label: u }))

// Prod caps the window at one month ("* maximum 1 month period").
watch(dateRange, (r) => {
  if (!r || r.length < 2) { dateError.value = false; return }
  const days = (r[1]!.getTime() - r[0]!.getTime()) / 86_400_000
  dateError.value = days > 31
})

const rows = computed<AuditEntry[]>(() => auditEntries.filter((a) => {
  if (actionFilter.value && a.action !== actionFilter.value) return false
  if (userFilter.value && a.user !== userFilter.value) return false
  if (dateRange.value && dateRange.value.length === 2 && !dateError.value) {
    const d = new Date(a.date)
    const end = new Date(dateRange.value[1]!); end.setHours(23, 59, 59, 999)
    if (d < dateRange.value[0]! || d > end) return false
  }
  return true
}))

const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<AuditEntry>(rows, {
  perPage: 25,
  filterFn: (row, s) => !s || [row.type, row.number, row.user, ...row.changes].join(' ').toLowerCase().includes(s),
  defaultSort: { key: 'date', dir: 'desc' },
})

const columns: TableColumn[] = [
  { key: 'date', label: t('Date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'action', label: t('Action'), kind: 'status' },
  { key: 'type', label: t('Type') },
  { key: 'number', label: t('Number'), kind: 'number' },
  { key: 'user', label: t('User') },
  { key: 'changes', label: t('Details'), kind: 'address' },
]

const hasActiveFilter = computed(() => !!search.value || !!actionFilter.value || !!userFilter.value || !!dateRange.value)
function clearFilters() { search.value = ''; actionFilter.value = ''; userFilter.value = ''; dateRange.value = null }
</script>

<template>
  <div class="al-root">
    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :has-active-filter="hasActiveFilter"
      bulk-label="activity"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="filter-left">
          <div class="al-date">
            <AdvancedDateRangePicker id="al-date" :model-value="dateRange" :placeholder="t('Date')" @update:model-value="dateRange = $event" />
            <span v-if="dateError" class="al-date-error">{{ t('Maximum difference date is 1 month') }}</span>
          </div>
          <ErpFilterSelect id="al-action" v-model="actionFilter" :placeholder="t('Action')" :options="actionOptions" width="160px" />
          <ErpFilterSelect id="al-user" v-model="userFilter" :placeholder="t('User')" :options="userOptions" width="176px" />
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" :aria-label="t('Search')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
              <MpIcon name="close" size="sm" />
            </button>
          </div>
        </div>
      </template>

      <template #cell-date="{ value }">{{ formatDateTime(value as string) }}</template>
      <template #cell-action="{ value }">{{ t(value as string) }}</template>
      <template #cell-number="{ row }">
        <span v-if="!(row as unknown as AuditEntry).deleted" class="cell-link cell-text">{{ (row as unknown as AuditEntry).number }}</span>
        <span v-else class="cell-text">{{ (row as unknown as AuditEntry).number }}</span>
      </template>
      <template #cell-changes="{ value }">
        <div class="al-changes">
          <span v-for="(c, i) in (value as string[])" :key="i">{{ c }}</span>
          <span v-if="!(value as string[]).length">-</span>
        </div>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('There is no data to display') }}</p>
        </div>
      </template>
    </ErpTablePage>
    <p class="al-tz">{{ t('Time is shown in GMT +7') }}</p>
  </div>
</template>

<style scoped>
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.al-root { display: flex; flex-direction: column; gap: var(--mp-spacing-3); height: 100%; min-height: 0; }
.filter-left { display: flex; align-items: flex-start; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.al-date { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.al-date-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

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

.al-changes { display: flex; flex-direction: column; white-space: normal; }
.al-tz { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
