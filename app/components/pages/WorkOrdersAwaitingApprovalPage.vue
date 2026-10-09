<script setup lang="ts">
/**
 * WorkOrdersAwaitingApprovalPage — Work orders › "Awaiting approval" tab. Lists EVERY work
 * order request still waiting for approval (start, adjustment,
 * completion, cancel/close), for all users. Approve, Reject and the row checkbox appear
 * only on the rows the viewer can approve right now (their level, not their own request
 * unless self-approval is allowed); everyone gets the Approval log and Comments. The
 * requester gets "Cancel approval request" on their own rows until someone approves
 * (grooming 2026-10-09). The tab badge counts all pending requests. Derived in woApproval.ts.
 */
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ApprovalLogModal from '~/components/patterns/ApprovalLogModal.vue'
import ApprovalCommentPopover from '~/components/patterns/ApprovalCommentPopover.vue'
import RejectTransactionModal from '~/components/patterns/RejectTransactionModal.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatDate } from '~/utils/date'
import {
  allPending, canApprove, approveRequest, rejectRequest, canCancelRequest, cancelRequest, requestTitle, approvalLogFor, commentsFor, addComment, waitingForText,
  requestWarehouseName, typeLabel, workOrderOf, woApprovalRequests,
  WO_TRANSACTION_TYPE_OPTIONS, type WoApprovalRequest,
} from '~/data/woApproval'
import type { ApprovalLog } from '~/data/warehouseTransfers'
import { WO_APPROVAL_ACTORS } from '~/composables/useWoApprovalActor'

const { t } = useLocale()
const router = useRouter()
const { actor, setActor } = useWoApprovalActor()

interface QueueRow {
  id: string
  workOrderId: string
  date: string
  number: string
  ref: string
  type: string
  typeKey: string
  warehouse: string
  requestedBy: string
  waitingFor: string
  /** the viewer can approve / reject this row */
  canAct: boolean
  /** the viewer requested it and nobody has approved yet — Cancel approval request */
  canCancel: boolean
}

const columns: TableColumn[] = [
  { key: 'date',        label: 'Date',             kind: 'date',   sortable: true, sortType: 'date' },
  { key: 'number',      label: 'Transaction no.',  kind: 'number', sortable: true, sortType: 'text' },
  { key: 'type',        label: 'Transaction type', kind: 'name' },
  { key: 'warehouse',   label: 'Warehouse',        kind: 'name' },
  { key: 'requestedBy', label: 'Requested by',     kind: 'name' },
  { key: 'waitingFor',  label: 'Waiting for',      kind: 'name' },
]

// ── Demo scenarios (FAB) + first-load skeleton ───────────────────────────────
type Scenario = 'data' | 'empty' | 'error'
const scenario = ref<Scenario>('data')
const scenarios = computed(() => [
  { label: t('Default'), value: 'data' },
  { label: t('Empty state'), value: 'empty' },
  { label: t('Load error'), value: 'error' },
  ...WO_APPROVAL_ACTORS.map(a => ({ label: t(a.label), value: `actor:${a.name}` })),
])
function onScenario(v: string) {
  if (v.startsWith('actor:')) { setActor(v.slice(6)); return }
  scenario.value = v as Scenario
  reload()
}
const loading = ref(true)
function reload() {
  loading.value = true
  setTimeout(() => { loading.value = false }, 800)
}
onMounted(reload)

// ── Filters ──────────────────────────────────────────────────────────────────
const typeFilter = ref('')
const warehouseFilter = ref('')
const typeOptions = computed(() => WO_TRANSACTION_TYPE_OPTIONS.map(o => ({ value: o.value, label: t(o.label) })))

const queue = computed<WoApprovalRequest[]>(() => (scenario.value === 'empty' ? [] : allPending()))

const warehouseOptions = computed(() => {
  const names = new Set(queue.value.map(r => requestWarehouseName(r) || t('Unassigned')))
  return [...names].map(n => ({ value: n, label: n }))
})

const baseRows = computed<QueueRow[]>(() => queue.value
  .map((r) => ({
    id: r.id,
    workOrderId: r.workOrderId,
    date: r.transactionDate,
    number: workOrderOf(r)?.number ?? '—',
    ref: r.ref ? `${t(typeLabel(r.type))} #${r.ref}` : '',
    type: t(typeLabel(r.type)),
    typeKey: r.type,
    warehouse: requestWarehouseName(r) || t('Unassigned'),
    requestedBy: r.requester,
    waitingFor: waitingForText(r) || '—',
    canAct: canApprove(r, actor.value),
    canCancel: canCancelRequest(r, actor.value),
  }))
  .filter(r => !typeFilter.value || r.typeKey === typeFilter.value)
  .filter(r => !warehouseFilter.value || r.warehouse === warehouseFilter.value))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<QueueRow>(baseRows, {
  filterFn: (row, s) => !s
    || row.number.toLowerCase().includes(s)
    || row.ref.toLowerCase().includes(s)
    || row.type.toLowerCase().includes(s)
    || row.requestedBy.toLowerCase().includes(s),
})
const hasActiveFilter = computed(() => !!search.value || !!typeFilter.value || !!warehouseFilter.value)
function clearFilters() { search.value = ''; typeFilter.value = ''; warehouseFilter.value = '' }
watch([typeFilter, warehouseFilter, actor], () => setPage(1))

const rowDisabled = (row: Record<string, unknown>) => !(row as unknown as QueueRow).canAct

function requestOf(id: string): WoApprovalRequest | undefined {
  return woApprovalRequests.find(r => r.id === id)
}
function viewDetails(row: QueueRow) { router.push(`/work-orders/${row.workOrderId}`) }

// ── Approve ──────────────────────────────────────────────────────────────────
function approve(row: QueueRow) {
  const req = requestOf(row.id)
  if (!req) return
  const label = t(typeLabel(req.type))
  const result = approveRequest(row.id, actor.value)
  if (!result) {
    toast.notify({ variant: 'error', title: t('Failed to process {n} requests').replace('{n}', '1') })
    return
  }
  toast.notify({
    variant: 'success',
    title: result.outcome === 'final'
      ? t('Request approved. {Type} applied').replace('{Type}', label)
      : t('Request approved. Waiting for level {n}').replace('{n}', String(result.nextLevel)),
  })
}

/** Would one more approval by the viewer clear the request's FINAL level? */
function completesOnApproval(req: WoApprovalRequest): boolean {
  if (req.currentLevel == null || req.currentLevel < req.levels.length) return false
  const level = req.levels[req.currentLevel - 1]!
  if (level.matchType === 'any') return true
  const approved = new Set(req.log.filter(e => e.event === 'approved' && e.level === req.currentLevel).map(e => e.user))
  approved.add(actor.value)
  return level.approvers.every(a => approved.has(a))
}

// ── Bulk approve (confirm — financially significant) ─────────────────────────
const bulkApproveOpen = ref(false)
const bulkIds = ref<string[]>([])
let bulkDeselect: (() => void) | null = null
function selectedIds(sel: Set<number>): string[] {
  return [...sel].map(i => paginated.value[i]).filter((r): r is QueueRow => !!r && r.canAct).map(r => r.id)
}
const bulkFinal = computed(() => bulkIds.value.map(requestOf).filter((r): r is WoApprovalRequest => !!r && completesOnApproval(r)).length)
const bulkNext = computed(() => bulkIds.value.length - bulkFinal.value)
const bulkApproveDescription = computed(() => [
  bulkFinal.value ? t('{a} requests will be fully approved and applied.').replace('{a}', String(bulkFinal.value)) : '',
  bulkNext.value ? t('{b} requests will move to their next approval level.').replace('{b}', String(bulkNext.value)) : '',
].filter(Boolean).join(' '))
function askBulkApprove(sel: Set<number>, deselectAll: () => void) {
  bulkIds.value = selectedIds(sel)
  bulkDeselect = deselectAll
  bulkApproveOpen.value = true
}
function confirmBulkApprove() {
  const failed = bulkIds.value.filter(id => !approveRequest(id, actor.value))
  const ok = bulkIds.value.length - failed.length
  if (failed.length) {
    toast.notify({ variant: 'error', title: t('Failed to process {n} requests').replace('{n}', String(failed.length)) })
  } else {
    bulkDeselect?.()
  }
  if (ok) toast.notify({ variant: 'success', title: t('{n} requests approved').replace('{n}', String(ok)) })
}

// ── Reject (single + bulk, one shared reason) ─────────────────────────────────
const rejectOpen = ref(false)
const rejectIds = ref<string[]>([])
const rejectTitle = computed(() => rejectIds.value.length > 1
  ? t('Reject {n} requests?').replace('{n}', String(rejectIds.value.length))
  : t('Reject request?'))
const rejectDescription = computed(() => {
  if (rejectIds.value.length > 1) return t('These requests won\'t be applied. Every requester will see the same reason.')
  const req = requestOf(rejectIds.value[0] ?? '')
  if (!req) return ''
  return t('{title} won\'t be applied. The requester will see your reason in the approval log.')
    .replace('{title}', `${t(typeLabel(req.type))}${req.ref ? ` ${req.ref}` : ''}`)
})
function askReject(row: QueueRow) {
  rejectIds.value = [row.id]
  bulkDeselect = null
  rejectOpen.value = true
}
function askBulkReject(sel: Set<number>, deselectAll: () => void) {
  rejectIds.value = selectedIds(sel)
  bulkDeselect = deselectAll
  rejectOpen.value = true
}
function confirmReject(reason: string) {
  const ok = rejectIds.value.filter(id => rejectRequest(id, actor.value, reason)).length
  rejectOpen.value = false
  bulkDeselect?.()
  toast.notify({
    variant: 'success',
    title: rejectIds.value.length > 1 ? t('{n} requests rejected').replace('{n}', String(ok)) : t('Request rejected'),
  })
}

// ── Cancel approval request (requester, before anyone approves) ─────────────────
const cancelOpen = ref(false)
const cancelId = ref('')
const cancelDescription = computed(() => {
  const req = requestOf(cancelId.value)
  return req
    ? t('{title} won\'t be applied and the work order is unlocked. You can submit it again later.').replace('{title}', t(requestTitle(req)))
    : ''
})
function askCancel(row: QueueRow) {
  cancelId.value = row.id
  cancelOpen.value = true
}
function confirmCancel() {
  if (!cancelRequest(cancelId.value, actor.value)) return
  toast.notify({ variant: 'success', title: t('Approval request canceled') })
}

// ── Approval log ─────────────────────────────────────────────────────────────
const logOpen = ref(false)
const logData = ref<ApprovalLog | null>(null)
function openLog(row: QueueRow) {
  const req = requestOf(row.id)
  if (!req) return
  logData.value = approvalLogFor(req)
  logOpen.value = true
}

function commentsOf(row: QueueRow) {
  return commentsFor(row.id).map(c => ({ id: c.id, author: c.author, timestamp: c.timestamp, text: c.text }))
}

const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <!-- Load error — inline retry (rule/form-errors-inline), never a toast -->
  <div v-if="scenario === 'error'" class="woaa-error" data-devchange="wo-approval-queue">
    <img :src="emptyIllustration" alt="" width="288" height="240" />
    <p class="woaa-error-title">{{ t('There is an error on our side') }}</p>
    <p class="woaa-error-desc">{{ t('Please reload this page or try again later.') }}</p>
    <MpButton variant="secondary" is-rounded class="btn-enterprise btn-enterprise--secondary" @click="onScenario('data')">{{ t('Try again') }}</MpButton>
  </div>

  <ErpTablePage
    v-else
    data-devchange="wo-approval-mvp-scope"
    :columns="columns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    has-checkbox
    :row-disabled="rowDisabled"
    actions-width="236px"
    bulk-label="request"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="woaa-type-filter" v-model="typeFilter" :placeholder="t('Transaction type')" :options="typeOptions" width="208px" />
        <ErpFilterSelect id="woaa-warehouse-filter" v-model="warehouseFilter" :placeholder="t('Warehouse')" :options="warehouseOptions" />
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search transaction')" />
        </div>
      </div>
    </template>

    <template #bulk-actions="{ selectedRows, deselectAll }">
      <MpButtonGroup>
        <MpButton class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" variant="secondary" size="sm" is-rounded
          @click="askBulkApprove(selectedRows as Set<number>, deselectAll)">{{ t('Approve') }}</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" variant="secondary" size="sm" is-rounded
          @click="askBulkReject(selectedRows as Set<number>, deselectAll)">{{ t('Reject') }}</MpButton>
      </MpButtonGroup>
    </template>

    <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>

    <template #cell-number="{ row }">
      <a class="cell-link cell-text" @click.stop="viewDetails(row as unknown as QueueRow)">{{ (row as unknown as QueueRow).number }}</a>
    </template>

    <template #cell-requestedBy="{ value }"><span class="woaa-secondary">{{ value }}</span></template>
    <template #cell-waitingFor="{ value }"><span class="woaa-secondary">{{ value }}</span></template>

    <template #actions="{ row }">
      <div class="woaa-actions">
        <!-- Approve / Reject only where the viewer is the approver at the current level -->
        <MpButton v-if="(row as unknown as QueueRow).canAct" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" variant="secondary" size="sm" is-rounded
          @click.stop="approve(row as unknown as QueueRow)">{{ t('Approve') }}</MpButton>
        <MpTooltip :id="`woaa-tt-log-${(row as unknown as QueueRow).id}`" :label="t('Approval log')" placement="top" use-portal>
          <MpButton class="row-icon-ghost" variant="ghost" is-rounded :aria-label="t('View approval log')" @click.stop="openLog(row as unknown as QueueRow)">
            <MpIcon name="task-todo" size="md" />
          </MpButton>
        </MpTooltip>
        <ApprovalCommentPopover
          :id="`woaa-comments-${(row as unknown as QueueRow).id}`"
          :comments="commentsOf(row as unknown as QueueRow)"
          :author="actor"
          @post="(text: string) => addComment((row as unknown as QueueRow).id, actor, text)"
        />
        <MpPopover :id="`woaa-actions-${(row as unknown as QueueRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton class="row-kebab" variant="ghost" is-rounded :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="viewDetails(row as unknown as QueueRow)">{{ t('View details') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="(row as unknown as QueueRow).canAct" :class="css({ color: 'var(--mp-text-critical)' })" @click="askReject(row as unknown as QueueRow)">{{ t('Reject') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="(row as unknown as QueueRow).canCancel" :class="css({ color: 'var(--mp-text-critical)' })" data-devchange="wo-approval-cancel-request" @click="askCancel(row as unknown as QueueRow)">{{ t('Cancel approval request') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </template>

    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No approval request') }}</p>
        <p class="empty-full-desc">{{ t('Approval requests will appear here.') }}</p>
        <MpButton variant="secondary" is-rounded class="btn-enterprise btn-enterprise--secondary empty-full-cta" @click="router.push({ query: { tab: 'All work orders' } })">{{ t('View work orders') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <ApprovalLogModal :is-open="logOpen" :log="logData" @close="logOpen = false" />

  <RejectTransactionModal
    :is-open="rejectOpen"
    doc-type="request"
    :title="rejectTitle"
    :description="rejectDescription"
    @close="rejectOpen = false"
    @reject="confirmReject"
  />

  <ConfirmModal
    v-model:is-open="bulkApproveOpen"
    :title="t('Approve {n} requests?').replace('{n}', String(bulkIds.length))"
    :description="bulkApproveDescription"
    :confirm-label="t('Approve')"
    :cancel-label="t('Cancel')"
    :is-danger="false"
    @confirm="confirmBulkApprove"
  />

  <ConfirmModal
    v-model:is-open="cancelOpen"
    :title="t('Cancel approval request?')"
    :description="cancelDescription"
    :confirm-label="t('Cancel request')"
    :cancel-label="t('Back')"
    @confirm="confirmCancel"
  />

  <ScenarioFab :model-value="scenario" :scenarios="scenarios" :aria-label="t('Change scenario state')" @update:model-value="onScenario" />
</template>

<style scoped>
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary);
  min-width: 200px;
}
.filter-search-input {
  flex: 1; border: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); outline: none;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

.cell-text { display: block; white-space: normal; word-break: break-word; }
.woaa-secondary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.woaa-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-1); }
/* Approval log / Comments icon buttons — same quiet ghost icon as the other approval queues */
.woaa-actions .row-icon-ghost,
.woaa-actions :deep(.row-icon-btn) {
  display: flex !important; align-items: center; justify-content: center;
  min-width: 0 !important; padding: var(--mp-spacing-1) !important;
  border: none !important; background: transparent !important;
  border-radius: var(--mp-radii-md) !important; color: var(--mp-text-secondary);
}
.woaa-actions .row-icon-ghost:hover,
.woaa-actions :deep(.row-icon-btn:hover) { background: var(--mp-background-neutral-hovered) !important; color: var(--mp-text-default); }

.empty-full, .woaa-error { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10) 0; text-align: center; }
.empty-full-title, .woaa-error-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc, .woaa-error-desc { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
