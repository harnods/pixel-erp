<script setup lang="ts">
/**
 * Stock availability (PRD §7, Story 10) — on hand / reserved / available with a
 * reserved-by-project breakdown. Contention shows competing reservations with
 * each project's priority; a higher-priority project may REQUEST a release,
 * decided by a person — nothing is auto-bumped. Issuing stock reserved to
 * another project is blocked or warned per company policy, naming the holder.
 * The Warehouse persona's view (OQ19).
 */
import PmTitleBar from '../PmTitleBar.vue'
import PmOverlay from '../PmOverlay.vue'
import { stockItems, reservations, reservedQty, availableQty, reservedByProject, releaseRequests, type StockItem } from '~/data/projectReservations'
import { getProject, getWorkPackage, peggableNodes } from '~/data/projects'
import { projectPolicy } from '~/data/projectPolicy'
import { requestRelease, issueStock, checkIssue } from '~/data/projectActions'
import { num } from '~/utils/projectFormat'
import { notifyResult } from '~/utils/projectToast'

const { t } = useLocale()
const router = useRouter()
const { asActor, role } = useProjectRole()

const search = ref('')
const onlyContention = ref(false)
const rows = computed(() => stockItems
  .filter(i => !search.value.trim() || i.name.toLowerCase().includes(search.value.trim().toLowerCase()))
  .map(i => {
    const byProject = [...reservedByProject(i.id).entries()].map(([pid, q]) => ({ p: getProject(pid)!, qty: q })).sort((a, b) => b.qty - a.qty)
    const pending = releaseRequests.filter(r => r.itemId === i.id && r.status === 'pending').length
    return { i, reserved: reservedQty(i.id), available: availableQty(i.id), byProject, contention: byProject.length > 1 && availableQty(i.id) < i.onHand * 0.15, pending }
  })
  .filter(r => !onlyContention.value || r.contention || r.pending))
const expanded = ref<string | null>(null)
const PRIORITY_TONE = { high: 'pm-pill--red', medium: 'pm-pill--yellow', low: 'pm-pill--gray' } as const

// Request release
const rq = reactive({ open: false, resId: '', toWp: '', qty: '', reason: '' })
const rqRes = computed(() => reservations.find(r => r.id === rq.resId))
const rqNodes = computed(() => peggableNodes().filter(n => n.projectId !== rqRes.value?.projectId && getWorkPackage(n.id)?.type === 'production'))
function openRequest(resId: string) { Object.assign(rq, { open: true, resId, toWp: rqNodes.value[0]?.id ?? '', qty: '', reason: '' }) }
function doRequest() {
  const wp = getWorkPackage(rq.toWp)
  if (!wp) return
  if (notifyResult(requestRelease({ fromReservationId: rq.resId, toProjectId: wp.projectId, toWpId: wp.id, qty: Number(rq.qty), reason: rq.reason }, asActor.value))) rq.open = false
}

// Issue
const iss = reactive({ open: false, item: null as StockItem | null, wpId: '', qty: '', ack: false })
const issNodes = computed(() => peggableNodes().filter(n => getWorkPackage(n.id)?.type === 'production'))
const issCheck = computed(() => {
  const wp = getWorkPackage(iss.wpId)
  if (!iss.item || !wp || !Number(iss.qty)) return null
  return checkIssue(iss.item.id, wp.projectId, Number(iss.qty))
})
function openIssue(item: StockItem) { Object.assign(iss, { open: true, item, wpId: issNodes.value[0]?.id ?? '', qty: '', ack: false }) }
function doIssue() {
  if (!iss.item) return
  if (notifyResult(issueStock(iss.item.id, iss.wpId, Number(iss.qty), iss.ack, asActor.value))) iss.open = false
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Stock availability')" :subtitle="t('On hand, reserved and available — with who holds what. Reserved stock is not committed cost.')" />
    <div class="pm-stage">
      <div class="pm-filters">
        <label class="pm-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          <input v-model="search" type="text" :placeholder="t('Search item...')" />
        </label>
        <label class="pm-check"><input v-model="onlyContention" type="checkbox" /> {{ t('Only contention') }}</label>
        <span class="pm-spacer" />
        <span class="pm-small pm-muted">{{ t('Issuing stock reserved to another project') }}: <strong>{{ projectPolicy.reservationIssuePolicy === 'block' ? t('Blocked') : t('Warned') }}</strong></span>
      </div>

      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr><th>{{ t('Item') }}</th><th>{{ t('Warehouse') }}</th><th class="pm-num">{{ t('On hand') }}</th><th class="pm-num">{{ t('Reserved') }}</th><th class="pm-num">{{ t('Available') }}</th><th>{{ t('Reserved by project') }}</th><th /></tr>
          </thead>
          <tbody>
            <template v-for="r in rows" :key="r.i.id">
              <tr class="pm-tr-click" @click="expanded = expanded === r.i.id ? null : r.i.id">
                <td>
                  <span class="pm-strong">{{ r.i.name }}</span>
                  <span v-if="r.contention" class="pm-pill pm-pill--red" style="margin-left: 6px">{{ t('Contention') }}</span>
                  <span v-if="r.pending" class="pm-pill pm-pill--blue" style="margin-left: 6px">{{ r.pending }} {{ t('release request') }}</span>
                </td>
                <td>{{ r.i.warehouse }}</td>
                <td class="pm-num">{{ num(r.i.onHand) }} {{ r.i.unit }}</td>
                <td class="pm-num">{{ num(r.reserved) }}</td>
                <td class="pm-num" :class="r.available <= 0 ? 'pm-neg' : ''">{{ num(r.available) }}</td>
                <td class="pm-wrap">
                  <span v-for="b in r.byProject" :key="b.p.id" class="pm-pill pm-pill--outline" style="margin: 0 4px 4px 0">{{ b.p.code }} · {{ num(b.qty) }}</span>
                  <span v-if="!r.byProject.length" class="pm-muted">—</span>
                </td>
                <td><button class="pm-link" type="button" @click.stop="openIssue(r.i)">{{ t('Issue') }}</button></td>
              </tr>
              <tr v-if="expanded === r.i.id">
                <td colspan="7" style="background: var(--mp-background-neutral-subtle)">
                  <div class="pm-table-wrap" style="background: #fff">
                    <table class="pm-table">
                      <thead><tr><th>{{ t('Project') }}</th><th>{{ t('Priority') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Status') }}</th><th /></tr></thead>
                      <tbody>
                        <tr v-for="res in reservations.filter(x => x.itemId === r.i.id && (x.status === 'reserved' || x.status === 'picked'))" :key="res.id">
                          <td><button class="pm-link" type="button" @click="router.push(`/projects/${res.projectId}?tab=production`)">{{ getProject(res.projectId)?.code }}</button> {{ getProject(res.projectId)?.name }}</td>
                          <td><span class="pm-pill" :class="PRIORITY_TONE[getProject(res.projectId)!.priority]">{{ t(getProject(res.projectId)!.priority === 'high' ? 'High' : getProject(res.projectId)!.priority === 'medium' ? 'Medium' : 'Low') }}</span></td>
                          <td>{{ getWorkPackage(res.wpId)?.code }} {{ getWorkPackage(res.wpId)?.name }}</td>
                          <td class="pm-num">{{ num(res.qty) }} {{ r.i.unit }}</td>
                          <td>{{ res.status === 'reserved' ? t('Reserved') : t('Picked') }}</td>
                          <td><button class="pm-link" type="button" @click="openRequest(res.id)">{{ t('Request release') }}</button></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-for="q in releaseRequests.filter(x => x.itemId === r.i.id)" :key="q.id" class="pm-small" style="margin-top: 6px">
                    <span class="pm-pill" :class="q.status === 'pending' ? 'pm-pill--blue' : q.status === 'approved' ? 'pm-pill--green' : 'pm-pill--red'">{{ q.status === 'pending' ? t('Pending') : q.status === 'approved' ? t('Approved') : t('Rejected') }}</span>
                    {{ q.qty }} {{ r.i.unit }} {{ getProject(q.fromProjectId)?.code }} → {{ getProject(q.toProjectId)?.code }} — {{ q.reason }}
                    <button v-if="q.status === 'pending'" class="pm-link pm-small" type="button" @click="router.push('/project-approvals')">{{ t('Open in Approvals') }}</button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p v-if="role !== 'warehouse'" class="pm-help" style="margin-top: 8px">{{ t('Tip: switch “View as” to Warehouse to see this page the way warehouse staff do.') }}</p>
    </div>

    <!-- Request release -->
    <PmOverlay :open="rq.open" variant="modal" :title="t('Request release')" :subtitle="rqRes ? `${getProject(rqRes.projectId)?.code} · ${num(rqRes.qty)} ${t('reserved')}` : ''" @close="rq.open = false">
      <div class="pm-banner pm-banner--neutral"><div class="pm-banner-body">{{ t('A person decides. Priority is shown to them, but nothing is bumped automatically.') }}</div></div>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="rq-wp">{{ t('For work package') }}</label>
        <select id="rq-wp" v-model="rq.toWp" class="pm-select"><option v-for="n in rqNodes" :key="n.id" :value="n.id">{{ n.label }}</option></select>
      </div>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="rq-q">{{ t('Quantity') }}</label>
        <input id="rq-q" v-model="rq.qty" class="pm-input pm-input--num" inputmode="numeric" style="max-width: 160px" />
      </div>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="rq-r">{{ t('Reason') }}</label>
        <textarea id="rq-r" v-model="rq.reason" class="pm-textarea" />
      </div>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="rq.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="doRequest">{{ t('Send request') }}</button>
      </template>
    </PmOverlay>

    <!-- Issue -->
    <PmOverlay :open="iss.open" variant="modal" :title="t('Issue stock')" :subtitle="iss.item ? `${iss.item.name} · ${num(iss.item.onHand)} ${iss.item.unit} ${t('on hand')}` : ''" @close="iss.open = false">
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="is-wp">{{ t('To work package') }}</label>
        <select id="is-wp" v-model="iss.wpId" class="pm-select" @change="iss.ack = false"><option v-for="n in issNodes" :key="n.id" :value="n.id">{{ n.label }}</option></select>
      </div>
      <div class="pm-field">
        <label class="pm-label pm-label-req" for="is-q">{{ t('Quantity') }}</label>
        <input id="is-q" v-model="iss.qty" class="pm-input pm-input--num" inputmode="numeric" style="max-width: 160px" @input="iss.ack = false" />
      </div>
      <template v-if="issCheck">
        <div class="pm-small pm-muted">{{ t('Reserved to this project') }}: {{ num(issCheck.own) }} · {{ t('free') }}: {{ num(issCheck.free) }}</div>
        <div v-if="issCheck.fromOthers" class="pm-banner" :class="issCheck.policy === 'block' ? 'pm-banner--error' : 'pm-banner--warn'">
          <div class="pm-banner-body">
            <div class="pm-banner-title">{{ num(issCheck.fromOthers) }} {{ iss.item?.unit }} {{ t('of this is reserved to another project') }}</div>
            <div v-for="h in issCheck.holders" :key="h.project.id">{{ h.project.code }} · {{ h.project.name }} — {{ t('priority') }} {{ t(h.project.priority === 'high' ? 'High' : h.project.priority === 'medium' ? 'Medium' : 'Low') }} ({{ num(h.qty) }})</div>
            <template v-if="issCheck.policy === 'block'">{{ t('Company policy blocks this. Request a release instead.') }}</template>
            <label v-else class="pm-check" style="margin-top: 6px"><input v-model="iss.ack" type="checkbox" /> {{ t('Issue anyway — this is recorded in the audit log') }}</label>
          </div>
        </div>
        <div v-else class="pm-banner pm-banner--success"><div class="pm-banner-body">{{ t('Covered by this project’s reservation and free stock.') }}</div></div>
      </template>
      <template #footer>
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="iss.open = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="!issCheck || (issCheck.fromOthers > 0 && (issCheck.policy === 'block' || !iss.ack))" @click="doIssue">{{ t('Issue') }}</button>
      </template>
    </PmOverlay>
  </div>
</template>
