<script setup lang="ts">
/**
 * Approvals — one inbox for five request kinds (PRD §9): change order ·
 * transaction overage · budget revision · engineering change · stock release.
 * PM raises; Finance/Controller decides (Warehouse may decide stock releases).
 * Nobody decides their own request.
 */
import PmTitleBar from '../PmTitleBar.vue'
import EcoDiff from '../EcoDiff.vue'
import { approvals, APPROVAL_KIND_LABELS, type ApprovalItem, type ApprovalKind } from '~/data/projectApprovals'
import { getProject, getWorkPackage, nodeLabel } from '~/data/projects'
import { changeOrders, engineeringChanges } from '~/data/projectChanges'
import { peggedDocuments, projectWorkOrders } from '~/data/projectTransactions'
import { releaseRequests, getStockItem } from '~/data/projectReservations'
import { accountName } from '~/data/projectBudgets'
import { percentComplete, recognisedToDate } from '~/data/projectRecognition'
import { decideApproval, effectivityText, ecoAffectedWos } from '~/data/projectActions'
import { rp, rpSigned, pct } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'

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

function blockReason(a: ApprovalItem): string {
  if (a.requestedBy === actor.value) return t('You raised this request, so someone else must decide it.')
  if (role.value === 'finance') return ''
  if (role.value === 'warehouse' && a.kind === 'stock_release') return ''
  return a.kind === 'stock_release' ? t('Finance or Warehouse decides stock releases. Switch “View as” to decide.') : t('Finance / Controller decides this. Switch “View as” to decide.')
}
function decide(a: ApprovalItem, approve: boolean) {
  if (!approve && !notes[a.id]?.trim()) { notes[a.id] = notes[a.id] ?? ''; expanded.value = a.id; notifyResult({ ok: false, error: t('Add a note explaining the rejection.') }); return }
  notifyResult(decideApproval(a.id, approve, asActor.value, notes[a.id]))
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
const KIND_TONE: Record<ApprovalKind, string> = { change_order: 'pm-pill--blue', overage: 'pm-pill--red', budget_revision: 'pm-pill--yellow', eco: 'pm-pill--blue', stock_release: 'pm-pill--gray' }
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Approvals')" :subtitle="t('Change orders, transaction overages, budget revisions, engineering changes and stock releases — one inbox.')" />
    <div class="pm-tabs" role="tablist">
      <button class="pm-tab" :class="{ 'pm-tab--active': !kind }" @click="kind = ''">{{ t('All') }} <span v-if="Object.values(counts).reduce((s, v) => s + v, 0)" class="pm-pill pm-pill--yellow" style="height: 18px; padding: 0 6px">{{ Object.values(counts).reduce((s, v) => s + v, 0) }}</span></button>
      <button v-for="(label, key) in APPROVAL_KIND_LABELS" :key="key" class="pm-tab" :class="{ 'pm-tab--active': kind === key }" @click="kind = key">
        {{ t(label) }} <span v-if="counts[key]" class="pm-pill pm-pill--yellow" style="height: 18px; padding: 0 6px">{{ counts[key] }}</span>
      </button>
    </div>
    <div class="pm-stage">
      <div class="pm-row" style="margin-bottom: 14px">
        <div class="pm-seg">
          <button type="button" :class="{ 'pm-seg--active': status === 'pending' }" @click="status = 'pending'">{{ t('Pending') }}</button>
          <button type="button" :class="{ 'pm-seg--active': status === 'decided' }" @click="status = 'decided'">{{ t('Decided') }}</button>
        </div>
        <span class="pm-spacer" />
        <span class="pm-small pm-muted">{{ t('Viewing as') }} {{ t(current.label) }} ({{ actor }})</span>
      </div>

      <div class="pm-stack" style="gap: 10px">
        <div v-for="a in list" :key="a.id" class="pm-card" style="padding: 0">
          <div class="pm-row pm-tr-click" style="padding: 14px 16px; gap: 12px; cursor: pointer" @click="expanded = expanded === a.id ? null : a.id">
            <span class="pm-pill" :class="KIND_TONE[a.kind]">{{ t(APPROVAL_KIND_LABELS[a.kind]) }}</span>
            <div style="flex: 1; min-width: 240px">
              <div class="pm-strong">{{ a.refNo }} · {{ a.title }}</div>
              <div class="pm-small pm-muted">{{ getProject(a.projectId)?.code }} · {{ getProject(a.projectId)?.name }} · {{ t('raised by') }} {{ a.requestedBy }} {{ t('on') }} {{ formatDate(a.requestedAt) }}</div>
            </div>
            <div v-if="a.kind === 'overage'" class="pm-num">
              <div class="pm-strong pm-neg">{{ t('Over by') }} {{ pct(a.overPct) }}</div>
              <div class="pm-small pm-muted">{{ t('Requested') }} {{ rp(a.requested) }} · {{ t('available') }} {{ rp(a.available) }}</div>
            </div>
            <div v-else-if="a.amount" class="pm-num pm-strong">{{ rp(a.amount) }}</div>
            <span v-if="a.status !== 'pending'" class="pm-pill" :class="a.status === 'approved' ? 'pm-pill--green' : 'pm-pill--red'">{{ a.status === 'approved' ? t('Approved') : t('Rejected') }}</span>
            <span class="pm-muted">{{ expanded === a.id ? '▴' : '▾' }}</span>
          </div>

          <div v-if="expanded === a.id" style="border-top: 1px solid var(--mp-border-default); padding: 16px" class="pm-stack">
            <div v-if="a.reason" class="pm-tl-reason" style="margin: 0"><span class="pm-muted">{{ t('Reason') }}:</span> {{ a.reason }}</div>

            <!-- Overage -->
            <template v-if="a.kind === 'overage'">
              <div class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ t('Held — the raiser sees this document as held, not silently stuck.') }}</div></div>
              <div v-if="doc(a)" class="pm-table-wrap">
                <table class="pm-table">
                  <thead><tr><th>{{ t('Line') }}</th><th>{{ t('Account') }}</th><th>{{ t('Project') }}</th><th class="pm-num">{{ t('Amount') }}</th></tr></thead>
                  <tbody><tr v-for="(l, i) in doc(a)!.lines" :key="i"><td>{{ l.description }}</td><td>{{ t(accountName(l.account)) }}</td><td>{{ l.wpId ? nodeLabel(l.wpId) : '—' }}</td><td class="pm-num">{{ rp(l.amount) }}</td></tr></tbody>
                </table>
              </div>
              <div v-else-if="wo(a)" class="pm-small">{{ wo(a)!.number }} · {{ nodeLabel(wo(a)!.wpId) }} · {{ t('set-aside') }} {{ rp(wo(a)!.budgetSetAside) }} ({{ t('estimate') }} {{ rp(wo(a)!.estimate) }})</div>
              <button class="pm-link pm-small" type="button" style="align-self: flex-start" @click="router.push(`/budget-setup/${a.projectId}?returnTo=${encodeURIComponent('/project-approvals')}`)">{{ t('Review the budget in Budget setup') }} →</button>
            </template>

            <!-- Change order -->
            <template v-else-if="a.kind === 'change_order' && vo(a)">
              <div class="pm-kv">
                <div><div class="pm-kv-label">{{ t('Work package') }}</div><div class="pm-kv-value">{{ nodeLabel(vo(a)!.wpId) }}</div></div>
                <div><div class="pm-kv-label">{{ t('Customer price') }}</div><div class="pm-kv-value">{{ rp(vo(a)!.price) }}</div></div>
                <div><div class="pm-kv-label">{{ t('Cost') }}</div><div class="pm-kv-value">{{ rp(vo(a)!.cost) }}</div></div>
                <div><div class="pm-kv-label">{{ t('Margin') }}</div><div class="pm-kv-value">{{ rp((vo(a)!.price ?? 0) - (vo(a)!.cost ?? 0)) }} ({{ pct(vo(a)!.price ? ((vo(a)!.price! - (vo(a)!.cost ?? 0)) / vo(a)!.price!) * 100 : 0) }})</div></div>
                <div><div class="pm-kv-label">{{ t('PSAK 72') }}</div><div class="pm-kv-value">{{ vo(a)!.distinct ? t('Distinct — prospective') : t('Not distinct — cumulative catch-up') }}</div></div>
                <div><div class="pm-kv-label">{{ t('New contract value') }}</div><div class="pm-kv-value">{{ rp((getProject(a.projectId)?.contractValue ?? 0) + (vo(a)!.price ?? 0)) }}</div></div>
                <div v-if="catchUpPreview(a) !== undefined"><div class="pm-kv-label">{{ t('Catch-up this period') }}</div><div class="pm-kv-value">{{ rpSigned(catchUpPreview(a)!) }}</div></div>
              </div>
              <p class="pm-help">{{ t('On approval, contract value and the work-package budget update through a revision, and the added scope reaches a billable line. A change order never changes the recognition method.') }}</p>
            </template>

            <!-- ECO -->
            <template v-else-if="a.kind === 'eco' && eco(a)">
              <div class="pm-kv">
                <div><div class="pm-kv-label">{{ t('Work package') }}</div><div class="pm-kv-value">{{ nodeLabel(eco(a)!.wpId) }}</div></div>
                <div><div class="pm-kv-label">{{ t('Effectivity') }}</div><div class="pm-kv-value">{{ t(effectivityText(eco(a)!.effectivity, eco(a)!.specificWoIds)) }}</div></div>
                <div><div class="pm-kv-label">{{ t('Affected work orders') }}</div><div class="pm-kv-value">{{ ecoAffectedWos(eco(a)!).map(w => w.number).join(', ') || t('None yet') }}</div></div>
                <div><div class="pm-kv-label">{{ t('Customer-funded') }}</div><div class="pm-kv-value">{{ eco(a)!.voId ? changeOrders.find(v => v.id === eco(a)!.voId)?.no : t('No — the ECO never changes contract value') }}</div></div>
              </div>
              <EcoDiff :bom-id="eco(a)!.customBomId" :base-version="eco(a)!.baseVersion" :proposed="eco(a)!.proposed" :units="Math.max((getWorkPackage(eco(a)!.wpId)?.plannedUnits ?? 0) - (getWorkPackage(eco(a)!.wpId)?.confirmedUnits ?? 0), 0)" />
              <p class="pm-help">{{ t('On approval: a new immutable BOM version, a budget revision for the cost delta, and reservations adjust (removed components free theirs; added ones create requirements).') }}</p>
            </template>

            <!-- Stock release -->
            <template v-else-if="a.kind === 'stock_release' && rr(a)">
              <div class="pm-kv">
                <div><div class="pm-kv-label">{{ t('Item') }}</div><div class="pm-kv-value">{{ rr(a)!.qty }} {{ getStockItem(rr(a)!.itemId)?.unit }} {{ getStockItem(rr(a)!.itemId)?.name }}</div></div>
                <div><div class="pm-kv-label">{{ t('Held by') }}</div><div class="pm-kv-value">{{ getProject(rr(a)!.fromProjectId)?.code }} · {{ t('priority') }} {{ t(PRIORITY_LABEL[getProject(rr(a)!.fromProjectId)!.priority]) }}</div></div>
                <div><div class="pm-kv-label">{{ t('Requested for') }}</div><div class="pm-kv-value">{{ nodeLabel(rr(a)!.toWpId) }} · {{ t('priority') }} {{ t(PRIORITY_LABEL[getProject(rr(a)!.toProjectId)!.priority]) }}</div></div>
              </div>
              <p class="pm-help">{{ t('Priority is informational — nothing is bumped automatically. A person decides.') }}</p>
            </template>

            <!-- Budget revision -->
            <template v-else-if="a.kind === 'budget_revision'">
              <div v-if="a.payload" class="pm-small">{{ t('Proposed baseline from Budget setup') }}: {{ a.payload.lines.length }} {{ t('lines') }}, {{ t('revenue') }} {{ rp(a.payload.revenue) }}.</div>
              <button class="pm-link pm-small" type="button" style="align-self: flex-start" @click="router.push(`/budget-setup/${a.projectId}?returnTo=${encodeURIComponent('/project-approvals')}`)">{{ t('Open in Budget setup') }} →</button>
            </template>

            <template v-if="a.status === 'pending'">
              <div class="pm-field">
                <label class="pm-label" :for="`note-${a.id}`">{{ t('Decision note') }}</label>
                <input :id="`note-${a.id}`" v-model="notes[a.id]" class="pm-input" :placeholder="t('Required when rejecting')" />
              </div>
              <div class="pm-row">
                <span v-if="blockReason(a)" class="pm-small pm-warn">{{ blockReason(a) }}</span>
                <span class="pm-spacer" />
                <button class="btn-enterprise btn-enterprise--ghost" type="button" :disabled="!!blockReason(a)" @click="decide(a, false)">{{ t('Reject') }}</button>
                <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!!blockReason(a)" @click="decide(a, true)">{{ t('Approve') }}</button>
              </div>
            </template>
            <div v-else class="pm-small pm-muted">{{ a.status === 'approved' ? t('Approved') : t('Rejected') }} {{ t('by') }} {{ a.decidedBy }} {{ t('on') }} {{ formatDate(a.decidedAt) }}<template v-if="a.decisionNote"> — “{{ a.decisionNote }}”</template></div>
            <button class="pm-link pm-small" type="button" style="align-self: flex-start" @click="router.push(`/projects/${a.projectId}`)">{{ t('Open project') }} →</button>
          </div>
        </div>
        <div v-if="!list.length" class="pm-card"><div class="pm-empty"><div class="pm-empty-title">{{ status === 'pending' ? t('Nothing waiting') : t('No decisions yet') }}</div>{{ status === 'pending' ? t('New requests from PMs appear here.') : '' }}</div></div>
      </div>
    </div>
  </div>
</template>
