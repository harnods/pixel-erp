<script setup lang="ts">
/**
 * WoApprovalLogTable — the "Approval log" tab on the Work order detail page (grooming
 * 2026-10-09): every approval request raised on the work order, newest first, with who
 * requested it, the approval rule that held it, its status and the latest decision
 * (approved / rejected + reason / canceled / waiting for). "View approval log" opens the
 * shared ApprovalLogModal timeline for that request.
 */
import { MpButton, MpIcon, MpTooltip } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  approvalHistoryForWorkOrder, REQUEST_STATUS_LABEL, WO_TRANSACTION_TYPE_OPTIONS,
  type WoApprovalHistoryRow, type WoApprovalRequest,
} from '~/data/woApproval'
import { formatDateTimeLong } from '~/utils/date'

const props = defineProps<{ workOrderId: string }>()
const emit = defineEmits<{ viewLog: [requestId: string] }>()
const { t } = useLocale()

const rows = computed<WoApprovalHistoryRow[]>(() => approvalHistoryForWorkOrder(props.workOrderId))

const columns: TableColumn[] = [
  { key: 'date',        label: 'Requested on',     kind: 'date' },
  { key: 'type',        label: 'Transaction type', kind: 'name' },
  { key: 'requestedBy', label: 'Requested by',     kind: 'name' },
  { key: 'rule',        label: 'Approval rule',    kind: 'name' },
  { key: 'status',      label: 'Status',           kind: 'status' },
  { key: 'lastAction',  label: 'Latest action' },
]

const STATUS_BADGE: Record<WoApprovalRequest['status'], { status: string; type: 'warning' | 'completed' | 'critical' | 'announcement' }> = {
  pending:  { status: 'pending',   type: 'warning' },
  executed: { status: 'approved',  type: 'completed' },
  rejected: { status: 'rejected',  type: 'critical' },
  canceled: { status: 'canceled',  type: 'announcement' },
}
const STATUS_OPTIONS = (Object.keys(REQUEST_STATUS_LABEL) as WoApprovalRequest['status'][])
  .map(v => ({ label: t(REQUEST_STATUS_LABEL[v]), value: v }))
const TYPE_OPTIONS = WO_TRANSACTION_TYPE_OPTIONS.map(o => ({ label: t(o.label), value: o.label }))

const typeFilter = ref('')
const statusFilter = ref('')

const { search, currentPage, paginated, total, perPage, setPage, setPerPage } = useTableState<WoApprovalHistoryRow>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s || row.ref.toLowerCase().includes(s) || row.requestedBy.toLowerCase().includes(s) || row.type.toLowerCase().includes(s)
    return matchesSearch && (!typeFilter.value || row.type === typeFilter.value) && (!statusFilter.value || row.status === statusFilter.value)
  },
})
watch([typeFilter, statusFilter], () => setPage(1))
const hasActiveFilter = computed(() => !!search.value || !!typeFilter.value || !!statusFilter.value)
function clearFilters() { search.value = ''; typeFilter.value = ''; statusFilter.value = '' }
</script>

<template>
  <!-- No request yet — illustration only, no filter bar -->
  <div v-if="!rows.length" class="walt-empty" data-devchange="wo-approval-log-tab">
    <img src="/illustrations/empty-folder.png" alt="" class="walt-empty-illustration" width="288" height="240" />
    <p class="walt-empty-title">{{ t('No approval request on this work order') }}</p>
    <p class="walt-empty-desc">{{ t('Requests for Start, Adjust, Complete and Cancel/close that need approval will appear here.') }}</p>
  </div>

  <ErpTablePage
    v-else
    data-devchange="wo-approval-log-tab"
    :columns="columns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :has-active-filter="hasActiveFilter"
    actions-width="44px"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="walt-type" v-model="typeFilter" :placeholder="t('Transaction type')" :options="TYPE_OPTIONS" width="200px" />
        <ErpFilterSelect id="walt-status" v-model="statusFilter" :placeholder="t('Status')" :options="STATUS_OPTIONS" width="180px" />
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
        </div>
      </div>
    </template>

    <template #cell-date="{ value }">{{ formatDateTimeLong(value as string) }}</template>
    <!-- Transaction type — request no. as the sub-label -->
    <template #cell-type="{ row }">
      <div class="walt-type">
        <span>{{ t((row as unknown as WoApprovalHistoryRow).type) }}</span>
        <span v-if="(row as unknown as WoApprovalHistoryRow).ref !== '—'" class="walt-sub">{{ (row as unknown as WoApprovalHistoryRow).ref }}</span>
      </div>
    </template>
    <template #cell-status="{ row }">
      <ErpStatusBadge
        :status="STATUS_BADGE[(row as unknown as WoApprovalHistoryRow).status].status"
        :type="STATUS_BADGE[(row as unknown as WoApprovalHistoryRow).status].type"
        :label="t(REQUEST_STATUS_LABEL[(row as unknown as WoApprovalHistoryRow).status])"
      />
    </template>
    <template #cell-lastAction="{ value }"><span class="walt-last">{{ value }}</span></template>

    <template #actions="{ row }">
      <MpTooltip :id="`walt-tt-${(row as unknown as WoApprovalHistoryRow).id}`" :label="t('View approval log')" placement="top" use-portal>
        <MpButton class="row-icon-ghost" variant="ghost" is-rounded :aria-label="t('View approval log')" @click.stop="emit('viewLog', (row as unknown as WoApprovalHistoryRow).id)">
          <MpIcon name="task-todo" size="md" />
        </MpButton>
      </MpTooltip>
    </template>
  </ErpTablePage>
</template>

<style scoped>
.walt-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10) 0; }
.walt-empty-illustration { margin-bottom: var(--mp-spacing-4); }
.walt-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.walt-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.walt-type { display: flex; flex-direction: column; }
.walt-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.walt-last { white-space: normal; color: var(--mp-text-secondary); }
</style>
