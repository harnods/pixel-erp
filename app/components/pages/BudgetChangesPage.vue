<script setup lang="ts">
/**
 * Budget changes (FG-4): every transfer, funding request, mid-year insert,
 * revision and saving fill or draw, with the approvals waiting on the person
 * acting (View as) and their unread notices.
 */
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpIcon, MpButton,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDRWhole } from '~/utils/currency'
import { formatDate, formatDateTime } from '~/utils/date'
import {
  budget, actingPerson, noticesFor, markNoticeRead, markAllNoticesRead, changeById, canEditChange, canWithdrawChange, withdrawChangeAs,
} from '~/data/budgetStore'
import {
  changeRows, changeStats, STATUS_FILTER_OPTIONS, WAITING_FOR_ME, CHANGE_KINDS, type ChangeRow,
} from '~/data/budgetUiChanges'
import { successToast } from '~/utils/toasts'

defineProps<{ orderId?: string }>()

const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const person = computed(() => { void budget.viewAs; return actingPerson() })
const rows = computed<ChangeRow[]>(() => { void budget.changes.length; return changeRows(person.value) })
const stats = computed(() => changeStats(person.value))

const unread = computed(() => noticesFor(person.value).filter((n) => !n.read))
function openNotice(id: number, link: string) {
  markNoticeRead(id)
  router.push(link)
}

const columns: TableColumn[] = [
  { key: 'number', label: 'Number', kind: 'number', sortable: true, sortType: 'text' },
  { key: 'kind', label: 'Kind', kind: 'default', sortable: true, sortType: 'text' },
  { key: 'from', label: 'From line', kind: 'address', sortable: true, sortType: 'text' },
  { key: 'to', label: 'To line', kind: 'address', sortable: true, sortType: 'text' },
  { key: 'amount', label: 'Amount', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'status', label: 'Status', kind: 'status', sortType: 'text' },
  { key: 'waitingFor', label: 'Waiting for', kind: 'name', sortable: true, sortType: 'text' },
  { key: 'date', label: 'Date', kind: 'date', sortType: 'date' },
]

const kindFilter = ref('')
const kindOptions = CHANGE_KINDS.map((k) => ({ value: k, label: t(k) }))
const statusOptions = STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: ChangeRow, s, status) => {
    const matchesSearch = !s || row.number.toLowerCase().includes(s) || row.from.toLowerCase().includes(s) || row.to.toLowerCase().includes(s) || row.preparedBy.toLowerCase().includes(s)
    const matchesStatus = !status || (status === WAITING_FOR_ME ? row.mine : row.status === status)
    const matchesKind = !kindFilter.value || row.kind === kindFilter.value
    return matchesSearch && matchesStatus && matchesKind
  },
})
watch(kindFilter, () => setPage(1))

// A stat link or a notice can land here with ?status=…
onMounted(() => {
  const q = route.query.status
  if (typeof q === 'string' && STATUS_FILTER_OPTIONS.some((o) => o.value === q)) statusFilter.value = q
})

const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value || !!kindFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = ''; kindFilter.value = '' }
function showStatus(v: string) { kindFilter.value = ''; search.value = ''; statusFilter.value = v }

function goDetail(id: string) { router.push(`/budget-changes/${id}`) }
function editDraft(id: string) { router.push({ path: '/budget-changes/new', query: { edit: id } }) }
const actionError = ref('')
function withdraw(id: string) {
  const res = withdrawChangeAs(id)
  if (!res.ok) { actionError.value = res.reason ?? ''; return }
  actionError.value = ''
  successToast(t('Change withdrawn'))
}
function canEdit(id: string) { const c = changeById(id); return !!c && canEditChange(c).ok }
function canWithdraw(id: string) { const c = changeById(id); return !!c && canWithdrawChange(c).ok }
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    filter-empty-label="budget change"
    bulk-label="budget change"
    :search="search"
    :has-active-filter="hasActiveFilter"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <template #stats>
      <div class="bc-head">
        <section v-if="unread.length" class="bc-notices" aria-live="polite">
          <div class="bc-notices__head">
            <span class="bc-notices__title">{{ t('Notifications') }} ({{ unread.length }})</span>
            <MpButton variant="ghost" is-rounded @click="markAllNoticesRead(person)">{{ t('Mark all as read') }}</MpButton>
          </div>
          <ul class="bc-notices__list">
            <li v-for="n in unread.slice(0, 5)" :key="n.id" class="bc-notice">
              <span class="cell-link bc-notice__text" @click="openNotice(n.id, n.link)">{{ n.text }}</span>
              <span class="bc-notice__at">{{ formatDateTime(n.at) }}</span>
            </li>
          </ul>
        </section>

        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Pending') }}</div>
            <div class="stat-period">{{ t('Waiting for approval · as of today') }}</div>
            <div class="stat-amount">{{ stats.pendingCount }}</div>
            <a class="stat-link" @click="showStatus('Pending')">{{ t('View pending changes') }}</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Pending amount') }}</div>
            <div class="stat-period">{{ t('Held for transfers · as of today') }}</div>
            <div class="stat-amount">{{ formatIDRWhole(stats.pendingAmount) }}</div>
            <a class="stat-link" @click="showStatus('Pending')">{{ stats.pendingCount }} {{ t(stats.pendingCount === 1 ? 'change' : 'changes') }}</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Approved this month') }}</div>
            <div class="stat-period">{{ t('Posted in October 2026') }}</div>
            <div class="stat-amount">{{ formatIDRWhole(stats.approvedAmount) }}</div>
            <a class="stat-link" @click="showStatus('Approved')">{{ stats.approvedCount }} {{ t(stats.approvedCount === 1 ? 'change' : 'changes') }}</a>
          </div>
          <div class="stat-card">
            <div class="stat-title">{{ t('My approvals waiting') }}</div>
            <div class="stat-period">{{ person }}</div>
            <div class="stat-amount">{{ stats.mineCount }}</div>
            <a class="stat-link" @click="showStatus(WAITING_FOR_ME)">{{ formatIDRWhole(stats.mineAmount) }}</a>
          </div>
        </div>
        <p v-if="actionError" class="bc-error" role="alert">{{ actionError }}</p>
      </div>
    </template>

    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="bc-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" width="232px" />
        <ErpFilterSelect id="bc-kind" v-model="kindFilter" :placeholder="t('Kind')" :options="kindOptions" />
        <MpButton v-if="hasActiveFilter" variant="ghost" is-rounded @click="clearFilters">{{ t('Clear filters') }}</MpButton>
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <template #cell-number="{ row }">
      <span class="cell-link cell-text" @click.stop="goDetail((row as ChangeRow).id)">{{ (row as ChangeRow).number }}</span>
    </template>
    <template #cell-kind="{ row }">{{ t((row as ChangeRow).kind) }}</template>
    <template #cell-amount="{ row }">{{ formatIDRWhole((row as ChangeRow).amount) }}</template>
    <template #cell-status="{ row }">
      <div class="status-cell">
        <ErpStatusBadge :status="(row as ChangeRow).status.toLowerCase()" :label="t((row as ChangeRow).status)" />
        <span v-if="(row as ChangeRow).mine" class="status-sub-label">{{ t('Waiting for you') }}</span>
      </div>
    </template>
    <template #cell-date="{ row }">{{ formatDate((row as ChangeRow).date) }}</template>

    <template #actions="{ row }">
      <MpPopover :id="`bc-row-${(row as ChangeRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="goDetail((row as ChangeRow).id)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="canEdit((row as ChangeRow).id)" @click="editDraft((row as ChangeRow).id)">{{ t('Edit draft') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="canWithdraw((row as ChangeRow).id)" @click="withdraw((row as ChangeRow).id)">{{ t('Withdraw') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No budget changes') }}</p>
        <p class="empty-full-desc">{{ t('Transfers, revisions and funding requests will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>
</template>

<style scoped>
.bc-head { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

.bc-notices {
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}
.bc-notices__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.bc-notices__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bc-notices__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.bc-notice { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.bc-notice__text { min-width: 0; }
.bc-notice__at { flex: none; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bc-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); text-decoration: none; cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }

.status-cell { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-0\.5); }
.status-sub-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
</style>
