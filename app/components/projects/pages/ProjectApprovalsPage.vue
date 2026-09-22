<script setup lang="ts">
/**
 * Approvals — one inbox for five request kinds (PRD §9): change order ·
 * transaction overage · budget revision · engineering change · stock release.
 * PM raises; Finance/Controller decides (Warehouse may decide stock releases).
 * Nobody decides their own request.
 */
import {
  MpButton, MpIcon, MpInput, MpTabs, MpTabList, MpTab, MpSegmentedControl, MpTextlink, MpFormControl, MpFormLabel, MpFormHelpText,
  MpBanner, MpBannerIcon, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmActionError from '../PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import EcoDiff from '../EcoDiff.vue'
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

const kind = ref<'' | ApprovalKind>('')
const status = ref<'pending' | 'decided'>('pending')
const list = computed(() => approvals
  .filter(a => (status.value === 'pending' ? a.status === 'pending' : a.status !== 'pending'))
  .filter(a => !kind.value || a.kind === kind.value)
  .slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)))
const counts = computed(() => {
  const m: Record<string, number> = {}
  for (const a of approvals.filter(x => x.status === 'pending')) m[a.kind] = (m[a.kind] ?? 0) + 1
  return m
})
const expanded = ref<string | null>(null)
const notes = reactive<Record<string, string>>({})
const errors = reactive<Record<string, string>>({})
const KIND_KEYS = Object.keys(APPROVAL_KIND_LABELS) as ApprovalKind[]
const totalPending = computed(() => Object.values(counts.value).reduce((s, v) => s + v, 0))
const tabIndex = computed({
  get: () => (kind.value ? KIND_KEYS.indexOf(kind.value) + 1 : 0),
  set: (i: number) => { kind.value = i === 0 ? '' : KIND_KEYS[i - 1] ?? '' },
})
const statusOptions = computed(() => [
  { id: 'appr-status-pending', label: t('Pending'), value: 'pending' },
  { id: 'appr-status-decided', label: t('Decided'), value: 'decided' },
])

function blockReason(a: ApprovalItem): string {
  if (a.requestedBy === actor.value) return t('You raised this request, so someone else must decide it.')
  if (role.value === 'finance') return ''
  if (role.value === 'warehouse' && a.kind === 'stock_release') return ''
  return a.kind === 'stock_release' ? t('Finance or Warehouse decides stock releases. Switch “View as” to decide.') : t('Finance / Controller decides this. Switch “View as” to decide.')
}
function decide(a: ApprovalItem, approve: boolean) {
  const block = blockReason(a)
  if (block) { errors[a.id] = block; return }
  if (!approve && !notes[a.id]?.trim()) { errors[a.id] = t('Add a note explaining the rejection.'); return }
  const res = decideApproval(a.id, approve, asActor.value, notes[a.id])
  if (res.ok) { errors[a.id] = ''; successToast(res.message ?? (approve ? t('Approved') : t('Rejected'))) }
  else errors[a.id] = res.error
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
      <MpTabs id="appr-kind-tabs" v-model="tabIndex" is-manual variant-color="green" class="detail-tabs pm-mb-4">
        <MpTabList>
          <MpTab id="appr-tab-all" value="all">{{ t('All') }}<template v-if="totalPending"> ({{ totalPending }})</template></MpTab>
          <MpTab v-for="key in KIND_KEYS" :id="`appr-tab-${key}`" :key="key" :value="key">{{ t(APPROVAL_KIND_LABELS[key]) }}<template v-if="counts[key]"> ({{ counts[key] }})</template></MpTab>
        </MpTabList>
      </MpTabs>

      <div class="pm-row pm-mb-4">
        <MpSegmentedControl id="appr-status" name="appr-status" v-model="status" :data="statusOptions" />
        <span class="pm-spacer" />
        <span class="pm-small pm-muted">{{ t('Viewing as') }} {{ t(current.label) }} ({{ actor }})</span>
      </div>

      <div class="pm-stack pm-gap-3">
        <div v-for="a in list" :key="a.id" class="pm-card pm-card--flush">
          <div class="pm-row pm-tr-click pm-approval-head" role="button" tabindex="0" @click="expanded = expanded === a.id ? null : a.id" @keydown.enter="expanded = expanded === a.id ? null : a.id">
            <ErpStatusBadge v-bind="badgeProps('kind', a.kind, t)" />
            <div class="pm-grow">
              <div class="pm-strong">{{ a.refNo }} · {{ a.title }}</div>
              <div class="pm-caption">{{ getProject(a.projectId)?.code }} · {{ getProject(a.projectId)?.name }} · {{ t('raised by') }} {{ a.requestedBy }} {{ t('on') }} {{ formatDate(a.requestedAt) }}</div>
            </div>
            <div v-if="a.kind === 'overage'" class="pm-num">
              <div class="pm-strong pm-neg">{{ t('Over by') }} {{ pct(a.overPct) }}</div>
              <div class="pm-caption">{{ t('Requested') }} {{ rp(a.requested) }} · {{ t('available') }} {{ rp(a.available) }}</div>
            </div>
            <div v-else-if="a.amount" class="pm-num pm-strong">{{ rp(a.amount) }}</div>
            <ErpStatusBadge v-if="a.status !== 'pending'" v-bind="badgeProps('approval', a.status, t)" />
            <MpIcon :name="expanded === a.id ? 'chevrons-down' : 'chevrons-right'" size="sm" />
          </div>

          <div v-if="expanded === a.id" class="pm-approval-body pm-stack">
            <div v-if="a.reason" class="pm-tl-reason pm-m-0"><span class="pm-muted">{{ t('Reason') }}:</span> {{ a.reason }}</div>

            <!-- Overage -->
            <template v-if="a.kind === 'overage'">
              <MpBanner :id="`appr-held-${a.id}`" variant="warning">
                <MpBannerIcon /><MpBannerDescription>{{ t('Held — the raiser sees this document as held, not silently stuck.') }}</MpBannerDescription>
              </MpBanner>
              <div v-if="doc(a)" class="pm-table-wrap">
                <table class="pm-table">
                  <thead><tr><th>{{ t('Line') }}</th><th>{{ t('Account') }}</th><th>{{ t('Project') }}</th><th class="pm-num">{{ t('Amount') }}</th></tr></thead>
                  <tbody><tr v-for="(l, i) in doc(a)!.lines" :key="i"><td>{{ l.description }}</td><td>{{ t(accountName(l.account)) }}</td><td>{{ l.wpId ? nodeLabel(l.wpId) : '—' }}</td><td class="pm-num">{{ rp(l.amount) }}</td></tr></tbody>
                </table>
              </div>
              <div v-else-if="wo(a)" class="pm-small">{{ wo(a)!.number }} · {{ nodeLabel(wo(a)!.wpId) }} · {{ t('set-aside') }} {{ rp(wo(a)!.budgetSetAside) }} ({{ t('estimate') }} {{ rp(wo(a)!.estimate) }})</div>
              <div><MpTextlink :id="`appr-budget-${a.id}`" as="a" @click.prevent="router.push(`/budget-setup/${a.projectId}?returnTo=${encodeURIComponent('/project-approvals')}`)">{{ t('Review the budget in Budget setup') }}</MpTextlink></div>
            </template>

            <!-- Change order -->
            <template v-else-if="a.kind === 'change_order' && vo(a)">
              <div class="pm-grid-3">
                <div><div class="pm-stat-label">{{ t('Work package') }}</div><div class="pm-body">{{ nodeLabel(vo(a)!.wpId) }}</div></div>
                <div><div class="pm-stat-label">{{ t('Customer price') }}</div><div class="pm-body">{{ rp(vo(a)!.price) }}</div></div>
                <div><div class="pm-stat-label">{{ t('Cost') }}</div><div class="pm-body">{{ rp(vo(a)!.cost) }}</div></div>
                <div><div class="pm-stat-label">{{ t('Margin') }}</div><div class="pm-body">{{ rp((vo(a)!.price ?? 0) - (vo(a)!.cost ?? 0)) }} ({{ pct(vo(a)!.price ? ((vo(a)!.price! - (vo(a)!.cost ?? 0)) / vo(a)!.price!) * 100 : 0) }})</div></div>
                <div><div class="pm-stat-label">{{ t('PSAK 72') }}</div><div class="pm-body">{{ vo(a)!.distinct ? t('Distinct — prospective') : t('Not distinct — cumulative catch-up') }}</div></div>
                <div><div class="pm-stat-label">{{ t('New contract value') }}</div><div class="pm-body">{{ rp((getProject(a.projectId)?.contractValue ?? 0) + (vo(a)!.price ?? 0)) }}</div></div>
                <div v-if="catchUpPreview(a) !== undefined"><div class="pm-stat-label">{{ t('Catch-up this period') }}</div><div class="pm-body">{{ rpSigned(catchUpPreview(a)!) }}</div></div>
              </div>
              <p class="pm-caption pm-m-0">{{ t('On approval, contract value and the work-package budget update through a revision, and the added scope reaches a billable line. A change order never changes the recognition method.') }}</p>
            </template>

            <!-- ECO -->
            <template v-else-if="a.kind === 'eco' && eco(a)">
              <div class="pm-grid-2">
                <div><div class="pm-stat-label">{{ t('Work package') }}</div><div class="pm-body">{{ nodeLabel(eco(a)!.wpId) }}</div></div>
                <div><div class="pm-stat-label">{{ t('Effectivity') }}</div><div class="pm-body">{{ t(effectivityText(eco(a)!.effectivity, eco(a)!.specificWoIds)) }}</div></div>
                <div><div class="pm-stat-label">{{ t('Affected work orders') }}</div><div class="pm-body">{{ ecoAffectedWos(eco(a)!).map(w => w.number).join(', ') || t('None yet') }}</div></div>
                <div><div class="pm-stat-label">{{ t('Customer-funded') }}</div><div class="pm-body">{{ eco(a)!.voId ? changeOrders.find(v => v.id === eco(a)!.voId)?.no : t('No — the ECO never changes contract value') }}</div></div>
              </div>
              <EcoDiff :bom-id="eco(a)!.customBomId" :base-version="eco(a)!.baseVersion" :proposed="eco(a)!.proposed" :units="ecoDeltaUnits(eco(a)!)" />
              <p class="pm-caption pm-m-0">{{ t('On approval: a new immutable BOM version, a budget revision for the cost delta, and reservations adjust (removed components free theirs; added ones create requirements).') }}</p>
            </template>

            <!-- Stock release -->
            <template v-else-if="a.kind === 'stock_release' && rr(a)">
              <div class="pm-grid-3">
                <div><div class="pm-stat-label">{{ t('Item') }}</div><div class="pm-body">{{ rr(a)!.qty }} {{ getStockItem(rr(a)!.itemId)?.unit }} {{ getStockItem(rr(a)!.itemId)?.name }}</div></div>
                <div><div class="pm-stat-label">{{ t('Held by') }}</div><div class="pm-body">{{ getProject(rr(a)!.fromProjectId)?.code }} · {{ t('priority') }} {{ t(PRIORITY_LABEL[getProject(rr(a)!.fromProjectId)!.priority]) }}</div></div>
                <div><div class="pm-stat-label">{{ t('Requested for') }}</div><div class="pm-body">{{ nodeLabel(rr(a)!.toWpId) }} · {{ t('priority') }} {{ t(PRIORITY_LABEL[getProject(rr(a)!.toProjectId)!.priority]) }}</div></div>
              </div>
              <p class="pm-caption pm-m-0">{{ t('Priority is informational — nothing is bumped automatically. A person decides.') }}</p>
            </template>

            <!-- Budget revision -->
            <template v-else-if="a.kind === 'budget_revision'">
              <div v-if="a.payload" class="pm-small">{{ t('Proposed baseline from Budget setup') }}: {{ a.payload.lines.length }} {{ t('lines') }}, {{ t('revenue') }} {{ rp(a.payload.revenue) }}.</div>
              <div><MpTextlink :id="`appr-open-budget-${a.id}`" as="a" @click.prevent="router.push(`/budget-setup/${a.projectId}?returnTo=${encodeURIComponent('/project-approvals')}`)">{{ t('Open in Budget setup') }}</MpTextlink></div>
            </template>

            <template v-if="a.status === 'pending'">
              <MpFormControl :id="`note-${a.id}-fc`">
                <MpFormLabel>{{ t('Decision note') }}</MpFormLabel>
                <MpInput :id="`note-${a.id}`" v-model="notes[a.id]" />
                <MpFormHelpText>{{ t('Required when rejecting') }}</MpFormHelpText>
              </MpFormControl>
              <PmActionError :id="`appr-error-${a.id}`" :error="errors[a.id] ?? ''" />
              <div class="pm-row"><span class="pm-spacer" />
                <MpButton :id="`appr-reject-${a.id}`" variant="ghost" is-rounded @click="decide(a, false)">{{ t('Reject') }}</MpButton>
                <MpButton :id="`appr-approve-${a.id}`" variant="primary" is-rounded @click="decide(a, true)">{{ t('Approve') }}</MpButton>
              </div>
            </template>
            <div v-else class="pm-caption">{{ a.status === 'approved' ? t('Approved') : t('Rejected') }} {{ t('by') }} {{ a.decidedBy }} {{ t('on') }} {{ formatDate(a.decidedAt) }}<template v-if="a.decisionNote"> — “{{ a.decisionNote }}”</template></div>
            <div><MpTextlink :id="`appr-project-${a.id}`" as="a" @click.prevent="router.push(`/projects/${a.projectId}`)">{{ t('Open project') }}</MpTextlink></div>
          </div>
        </div>
        <div v-if="!list.length" class="pm-card pm-empty-inline">
          <div class="pm-empty-title">{{ status === 'pending' ? t('Nothing waiting') : t('No decisions yet') }}</div>
          <div v-if="status === 'pending'" class="pm-empty-desc">{{ t('New requests from PMs appear here.') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
