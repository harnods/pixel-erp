<script setup lang="ts">
/**
 * Approvals — one inbox for five request kinds (PRD §9): change order ·
 * transaction overage · budget revision · engineering change · stock release.
 * PM raises; Finance/Controller decides (Warehouse may decide stock releases).
 * Nobody decides their own request.
 *
 * Index-page standard: ErpTablePage + useTableState (rule/table-use-erptablepage),
 * filter bar with ErpFilterSelect + search (rule/filter-bar-anatomy). Type and
 * status are columns and filters — not tabs. A row opens the review drawer, where
 * the request's own detail and the decision (with its note) live.
 */
import { MpButton, MpIcon, MpInput, MpTextlink, MpFormControl, MpFormLabel, MpFormHelpText } from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmMenu from '../PmMenu.vue'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import EcoDiff from '../EcoDiff.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { approvals, APPROVAL_KIND_LABELS, type ApprovalItem, type ApprovalKind } from '~/data/projectApprovals'
import { getProject, getWorkPackage, nodeLabel } from '~/data/projects'
import { changeOrders, engineeringChanges } from '~/data/projectChanges'
import { peggedDocuments, projectWorkOrders } from '~/data/projectTransactions'
import { releaseRequests, getStockItem } from '~/data/projectReservations'
import { accountName } from '~/data/projectBudgets'
import { percentComplete, recognisedToDate } from '~/data/projectRecognition'
import { decideApproval, effectivityText, ecoAffectedWos, ecoDeltaUnits } from '~/data/projectActions'
import { rp, rpSigned, pct } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()
const { role, actor, asActor, current } = useProjectRole()

const KIND_KEYS = Object.keys(APPROVAL_KIND_LABELS) as ApprovalKind[]
const kindFilter = ref('')
const statusFilter = ref('pending')
const kindOptions = computed(() => KIND_KEYS.map(k => ({ value: k, label: t(APPROVAL_KIND_LABELS[k]) })))
const statusOptions = computed(() => [
  { value: 'pending', label: t('Pending') },
  { value: 'approved', label: t('Approved') },
  { value: 'rejected', label: t('Rejected') },
])

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// Row = the request flattened so every column sorts on its own value.
interface Row {
  id: string; refNo: string; title: string; kind: ApprovalKind; kindLabel: string
  project: string; projectId: string; requestedBy: string; requestedAt: string
  amount: number; status: ApprovalItem['status']; a: ApprovalItem
}
const rows = computed<Row[]>(() => approvals.map(a => ({
  id: a.id, refNo: a.refNo, title: a.title, kind: a.kind, kindLabel: t(APPROVAL_KIND_LABELS[a.kind]),
  project: `${getProject(a.projectId)?.code} · ${getProject(a.projectId)?.name}`, projectId: a.projectId,
  requestedBy: a.requestedBy, requestedAt: a.requestedAt,
  amount: a.kind === 'overage' ? (a.requested ?? 0) : (a.amount ?? 0), status: a.status, a,
})))

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  defaultSort: { key: 'requestedAt', dir: 'desc' },
  filterFn: (r, s) => {
    const matches = !s || r.refNo.toLowerCase().includes(s) || r.title.toLowerCase().includes(s) || r.project.toLowerCase().includes(s)
    return matches && (!kindFilter.value || r.kind === kindFilter.value) && (!statusFilter.value || r.status === statusFilter.value)
  },
})
watch([kindFilter, statusFilter], () => setPage(1))
const hasActiveFilter = computed(() => !!kindFilter.value || statusFilter.value !== 'pending')
function clearFilters() { kindFilter.value = ''; statusFilter.value = 'pending'; search.value = '' }

const columns = computed<TableColumn[]>(() => [
  { key: 'refNo', label: t('Request'), kind: 'number', sortType: 'text' },
  { key: 'kindLabel', label: t('Type'), sortType: 'text' },
  { key: 'project', label: t('Project'), kind: 'name', sortType: 'text' },
  { key: 'requestedBy', label: t('Raised by'), kind: 'name', sortType: 'text' },
  { key: 'requestedAt', label: t('Raised on'), kind: 'date', sortType: 'text' },
  { key: 'amount', label: t('Amount'), kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'status', label: t('Status'), kind: 'status', sortType: 'text' },
])
const asRow = (r: unknown) => r as Row

// ── Review drawer: the request's own detail + the decision ──
const reviewId = ref('')
const note = ref('')
const action = useProjectAction()
const current_ = computed(() => approvals.find(a => a.id === reviewId.value))
function openReview(a: ApprovalItem) { reviewId.value = a.id; note.value = ''; action.clear() }
function closeReview() { reviewId.value = ''; action.clear() }

function blockReason(a: ApprovalItem): string {
  if (a.requestedBy === actor.value) return t('You raised this request, so someone else must decide it.')
  if (role.value === 'finance') return ''
  if (role.value === 'warehouse' && a.kind === 'stock_release') return ''
  return a.kind === 'stock_release' ? t('Finance or Warehouse decides stock releases. Switch “View as” to decide.') : t('Finance / Controller decides this. Switch “View as” to decide.')
}
function decide(approve: boolean) {
  const a = current_.value
  if (!a) return
  const block = blockReason(a)
  if (block) { action.fail(block); return }
  if (!approve && !note.value.trim()) { action.fail(t('Add a note explaining the rejection.')); return }
  const res = decideApproval(a.id, approve, asActor.value, note.value)
  if (res.ok) { successToast(res.message ?? (approve ? t('Approved') : t('Rejected'))); closeReview() }
  else action.fail(res.error)
}

const vo = (a: ApprovalItem) => changeOrders.find(v => v.id === a.refId)
const eco = (a: ApprovalItem) => engineeringChanges.find(e => e.id === a.refId)
const doc = (a: ApprovalItem) => peggedDocuments.find(d => d.id === a.refId)
const wo = (a: ApprovalItem) => projectWorkOrders.find(w => w.id === a.refId)
const rr = (a: ApprovalItem) => releaseRequests.find(r => r.id === a.refId)
function catchUpPreview(a: ApprovalItem): number | undefined {
  const v = vo(a)
  const p = getProject(a.projectId)
  if (!v || !p || v.distinct || p.method === 'tm') return undefined
  const pc = p.method === 'output' && p.measure === 'milestone' ? undefined : percentComplete(p)
  if (pc === undefined || !pc) return undefined
  return Math.round((pc / 100) * (p.contractValue + (v.price ?? 0))) - recognisedToDate(p.id)
}
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Approvals')" />
    <div class="pm-stage">
      <ErpTablePage
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :has-active-search="!!search"
        :has-active-filter="hasActiveFilter"
        :search="search"
        filter-empty-label="request"
        actions-align-top
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="appr-status-filter" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
            <ErpFilterSelect id="appr-kind-filter" v-model="kindFilter" :placeholder="t('Type')" :options="kindOptions" width="200px" />
          </div>
          <div class="filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search request, project...')" />
            </div>
          </div>
        </template>

        <template #cell-refNo="{ row }">
          <div>
            <span class="pm-link" role="link" tabindex="0" @click.stop="openReview(asRow(row).a)">{{ asRow(row).refNo }}</span>
            <span class="pm-cell-sub">{{ asRow(row).title }}</span>
          </div>
        </template>
        <template #cell-kindLabel="{ row }"><ErpStatusBadge v-bind="badgeProps('kind', asRow(row).kind, t)" /></template>
        <template #cell-project="{ row }">
          <div>
            <span>{{ getProject(asRow(row).projectId)?.code }}</span>
            <span class="pm-cell-sub">{{ getProject(asRow(row).projectId)?.name }}</span>
          </div>
        </template>
        <template #cell-requestedAt="{ row }">{{ formatDate(asRow(row).requestedAt) }}</template>
        <template #cell-amount="{ row }">
          <template v-if="asRow(row).a.kind === 'overage'">
            <span class="pm-neg">{{ rp(asRow(row).amount) }}</span>
            <span class="pm-cell-sub">{{ t('Over by') }} {{ pct(asRow(row).a.overPct) }}</span>
          </template>
          <template v-else-if="asRow(row).amount">{{ rp(asRow(row).amount) }}</template>
          <span v-else class="pm-muted">—</span>
        </template>
        <template #cell-status="{ row }"><ErpStatusBadge v-bind="badgeProps('approval', asRow(row).status, t)" /></template>

        <template #actions="{ row }">
          <PmMenu :id="`appr-row-${asRow(row).id}`" kebab :label="t('More actions')" :items="[
            { label: asRow(row).status === 'pending' ? t('Review request') : t('View request'), action: () => openReview(asRow(row).a) },
            { label: t('Open project'), action: () => router.push(`/projects/${asRow(row).projectId}`) },
          ]" />
        </template>

        <template #empty>
          <div class="pm-empty-inline">
            <div class="pm-empty-title">{{ statusFilter === 'pending' ? t('Nothing waiting') : t('No decisions yet') }}</div>
            <div class="pm-empty-desc">{{ statusFilter === 'pending' ? t('New requests from PMs appear here.') : '' }}</div>
          </div>
        </template>
      </ErpTablePage>
      <p class="pm-caption pm-mt-2">{{ t('Viewing as') }} {{ t(current.label) }} ({{ actor }})</p>
    </div>

    <!-- Review drawer — the request's own detail, then the decision -->
    <PmOverlay
      id="appr-review" :open="!!current_" wide
      :title="current_ ? `${current_.refNo} · ${current_.title}` : ''"
      :subtitle="current_ ? `${t(APPROVAL_KIND_LABELS[current_.kind])} · ${getProject(current_.projectId)?.code} · ${t('raised by')} ${current_.requestedBy} ${t('on')} ${formatDate(current_.requestedAt)}` : ''"
      @close="closeReview"
    >
      <template v-if="current_">
        <div class="pm-row pm-gap-2">
          <ErpStatusBadge v-bind="badgeProps('approval', current_.status, t)" />
          <ErpStatusBadge v-bind="badgeProps('kind', current_.kind, t)" />
        </div>
        <div v-if="current_.reason" class="pm-tl-reason pm-m-0"><span class="pm-muted">{{ t('Reason') }}:</span> {{ current_.reason }}</div>

        <!-- Overage -->
        <template v-if="current_.kind === 'overage'">
          <div class="pm-grid-3">
            <div><div class="pm-stat-label">{{ t('Requested') }}</div><div class="pm-body">{{ rp(current_.requested) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Available') }}</div><div class="pm-body">{{ rp(current_.available) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Over by') }}</div><div class="pm-body pm-neg">{{ pct(current_.overPct) }}</div></div>
          </div>
          <div v-if="doc(current_)" class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Line') }}</th><th>{{ t('Account') }}</th><th>{{ t('Project') }}</th><th class="pm-num">{{ t('Amount') }}</th></tr></thead>
              <tbody><tr v-for="(l, i) in doc(current_)!.lines" :key="i"><td>{{ l.description }}</td><td>{{ t(accountName(l.account)) }}</td><td>{{ l.wpId ? nodeLabel(l.wpId) : '—' }}</td><td class="pm-num">{{ rp(l.amount) }}</td></tr></tbody>
            </table>
          </div>
          <div v-else-if="wo(current_)" class="pm-small">{{ wo(current_)!.number }} · {{ nodeLabel(wo(current_)!.wpId) }} · {{ t('set-aside') }} {{ rp(wo(current_)!.budgetSetAside) }} ({{ t('estimate') }} {{ rp(wo(current_)!.estimate) }})</div>
          <div><MpTextlink id="appr-budget-link" as="a" @click.prevent="router.push(`/budget-setup/${current_.projectId}?returnTo=${encodeURIComponent('/project-approvals')}`)">{{ t('Review the budget in Budget setup') }}</MpTextlink></div>
        </template>

        <!-- Change order -->
        <template v-else-if="current_.kind === 'change_order' && vo(current_)">
          <div class="pm-grid-3">
            <div><div class="pm-stat-label">{{ t('Work package') }}</div><div class="pm-body">{{ nodeLabel(vo(current_)!.wpId) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Customer price') }}</div><div class="pm-body">{{ rp(vo(current_)!.price) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Cost') }}</div><div class="pm-body">{{ rp(vo(current_)!.cost) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Margin') }}</div><div class="pm-body">{{ rp((vo(current_)!.price ?? 0) - (vo(current_)!.cost ?? 0)) }} ({{ pct(vo(current_)!.price ? ((vo(current_)!.price! - (vo(current_)!.cost ?? 0)) / vo(current_)!.price!) * 100 : 0) }})</div></div>
            <div><div class="pm-stat-label">{{ t('PSAK 72') }}</div><div class="pm-body">{{ vo(current_)!.distinct ? t('Distinct — prospective') : t('Not distinct — cumulative catch-up') }}</div></div>
            <div><div class="pm-stat-label">{{ t('New contract value') }}</div><div class="pm-body">{{ rp((getProject(current_.projectId)?.contractValue ?? 0) + (vo(current_)!.price ?? 0)) }}</div></div>
            <div v-if="catchUpPreview(current_) !== undefined"><div class="pm-stat-label">{{ t('Catch-up this period') }}</div><div class="pm-body">{{ rpSigned(catchUpPreview(current_)!) }}</div></div>
          </div>
          <p class="pm-caption pm-m-0">{{ t('On approval, contract value and the work-package budget update through a revision, and the added scope reaches a billable line. A change order never changes the recognition method.') }}</p>
        </template>

        <!-- ECO -->
        <template v-else-if="current_.kind === 'eco' && eco(current_)">
          <div class="pm-grid-2">
            <div><div class="pm-stat-label">{{ t('Work package') }}</div><div class="pm-body">{{ nodeLabel(eco(current_)!.wpId) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Effectivity') }}</div><div class="pm-body">{{ t(effectivityText(eco(current_)!.effectivity, eco(current_)!.specificWoIds)) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Affected work orders') }}</div><div class="pm-body">{{ ecoAffectedWos(eco(current_)!).map(w => w.number).join(', ') || t('None yet') }}</div></div>
            <div><div class="pm-stat-label">{{ t('Customer-funded') }}</div><div class="pm-body">{{ eco(current_)!.voId ? changeOrders.find(v => v.id === eco(current_)!.voId)?.no : t('No — the ECO never changes contract value') }}</div></div>
          </div>
          <EcoDiff :bom-id="eco(current_)!.customBomId" :base-version="eco(current_)!.baseVersion" :proposed="eco(current_)!.proposed" :units="ecoDeltaUnits(eco(current_)!)" />
          <p class="pm-caption pm-m-0">{{ t('On approval: a new immutable BOM version, a budget revision for the cost delta, and reservations adjust (removed components free theirs; added ones create requirements).') }}</p>
        </template>

        <!-- Stock release -->
        <template v-else-if="current_.kind === 'stock_release' && rr(current_)">
          <div class="pm-grid-3">
            <div><div class="pm-stat-label">{{ t('Item') }}</div><div class="pm-body">{{ rr(current_)!.qty }} {{ getStockItem(rr(current_)!.itemId)?.unit }} {{ getStockItem(rr(current_)!.itemId)?.name }}</div></div>
            <div><div class="pm-stat-label">{{ t('Held by') }}</div><div class="pm-body">{{ getProject(rr(current_)!.fromProjectId)?.code }} · {{ t('priority') }} {{ t(PRIORITY_LABEL[getProject(rr(current_)!.fromProjectId)!.priority]) }}</div></div>
            <div><div class="pm-stat-label">{{ t('Requested for') }}</div><div class="pm-body">{{ nodeLabel(rr(current_)!.toWpId) }} · {{ t('priority') }} {{ t(PRIORITY_LABEL[getProject(rr(current_)!.toProjectId)!.priority]) }}</div></div>
          </div>
          <p class="pm-caption pm-m-0">{{ t('Priority is informational — nothing is bumped automatically. A person decides.') }}</p>
        </template>

        <!-- Budget revision -->
        <template v-else-if="current_.kind === 'budget_revision'">
          <div v-if="current_.payload" class="pm-small">{{ t('Proposed baseline from Budget setup') }}: {{ current_.payload.lines.length }} {{ t('lines') }}, {{ t('revenue') }} {{ rp(current_.payload.revenue) }}.</div>
          <div><MpTextlink id="appr-open-budget" as="a" @click.prevent="router.push(`/budget-setup/${current_.projectId}?returnTo=${encodeURIComponent('/project-approvals')}`)">{{ t('Open in Budget setup') }}</MpTextlink></div>
        </template>

        <template v-if="current_.status === 'pending'">
          <MpFormControl id="appr-note-fc">
            <MpFormLabel>{{ t('Decision note') }}</MpFormLabel>
            <MpInput id="appr-note" v-model="note" />
            <MpFormHelpText>{{ t('Required when rejecting') }}</MpFormHelpText>
          </MpFormControl>
          <PmActionError id="appr-error" :error="action.error.value" />
        </template>
        <div v-else class="pm-caption">
          {{ current_.status === 'approved' ? t('Approved') : t('Rejected') }} {{ t('by') }} {{ current_.decidedBy }} {{ t('on') }} {{ formatDate(current_.decidedAt) }}<template v-if="current_.decisionNote"> — “{{ current_.decisionNote }}”</template>
        </div>
        <div><MpTextlink id="appr-open-project" as="a" @click.prevent="router.push(`/projects/${current_.projectId}`)">{{ t('Open project') }}</MpTextlink></div>
      </template>

      <template #footer>
        <MpButton variant="ghost" is-rounded @click="closeReview">{{ current_?.status === 'pending' ? t('Cancel') : t('Close') }}</MpButton>
        <template v-if="current_?.status === 'pending'">
          <MpButton id="appr-reject" variant="ghost" is-rounded @click="decide(false)">{{ t('Reject') }}</MpButton>
          <MpButton id="appr-approve" variant="primary" is-rounded @click="decide(true)">{{ t('Approve') }}</MpButton>
        </template>
      </template>
    </PmOverlay>
  </div>
</template>
