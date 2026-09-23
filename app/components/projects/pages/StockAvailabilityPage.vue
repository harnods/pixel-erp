<script setup lang="ts">
/**
 * Stock availability (PRD §7, Story 10) — on hand / reserved / available with a
 * reserved-by-project breakdown. Contention shows competing reservations with
 * each project's priority; a higher-priority project may REQUEST a release,
 * decided by a person — nothing is auto-bumped. Issuing stock reserved to
 * another project is blocked or warned per company policy, naming the holder.
 * The Warehouse persona's view (OQ19).
 */
import {
  MpIcon, MpButton, MpInput, MpTextarea, MpCheckbox, MpTag, MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { stockItems, reservations, reservedQty, availableQty, reservedByProject, releaseRequests, type StockItem } from '~/data/projectReservations'
import { getProject, getWorkPackage, peggableNodes } from '~/data/projects'
import { projectPolicy } from '~/data/projectPolicy'
import { requestRelease, issueStock, checkIssue } from '~/data/projectActions'
import { num } from '~/utils/projectFormat'
import { badgeProps } from '~/utils/projectStatus'

const { t } = useLocale()
const router = useRouter()
const { asActor, role } = useProjectRole()
const rqAction = useProjectAction()
const issAction = useProjectAction()

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
const priorityLabel = (p: string) => t(p === 'high' ? 'High' : p === 'medium' ? 'Medium' : 'Low')

// Request release
const rq = reactive({ open: false, resId: '', toWp: '', qty: '', reason: '', touched: false })
const rqRes = computed(() => reservations.find(r => r.id === rq.resId))
const rqNodes = computed(() => peggableNodes().filter(n => n.projectId !== rqRes.value?.projectId && getWorkPackage(n.id)?.type === 'production'))
const rqOptions = computed(() => rqNodes.value.map(n => ({ value: n.id, label: n.label })))
function openRequest(resId: string) {
  rqAction.clear()
  Object.assign(rq, { open: true, resId, toWp: '', qty: '', reason: '', touched: false })
  rq.toWp = rqNodes.value[0]?.id ?? ''
}
function doRequest() {
  rq.touched = true
  const wp = getWorkPackage(rq.toWp)
  if (!wp || !Number(rq.qty) || !rq.reason.trim()) return
  if (rqAction.run(requestRelease({ fromReservationId: rq.resId, toProjectId: wp.projectId, toWpId: wp.id, qty: Number(rq.qty), reason: rq.reason }, asActor.value))) rq.open = false
}

// Issue
const iss = reactive({ open: false, item: null as StockItem | null, wpId: '', qty: '', ack: false, touched: false })
const issNodes = computed(() => peggableNodes().filter(n => getWorkPackage(n.id)?.type === 'production'))
const issCheck = computed(() => {
  const wp = getWorkPackage(iss.wpId)
  if (!iss.item || !wp || !Number(iss.qty)) return null
  return checkIssue(iss.item.id, wp.projectId, Number(iss.qty))
})
const issOptions = computed(() => issNodes.value.map(n => ({ value: n.id, label: n.label })))
watch(() => [iss.wpId, iss.qty], () => { iss.ack = false })
function openIssue(item: StockItem) {
  issAction.clear()
  Object.assign(iss, { open: true, item, wpId: issNodes.value[0]?.id ?? '', qty: '', ack: false, touched: false })
}
function doIssue() {
  iss.touched = true
  if (!iss.item || !issCheck.value) return
  if (issCheck.value.fromOthers > 0 && issCheck.value.policy === 'block') { issAction.fail(t('Company policy blocks this. Request a release instead.')); return }
  if (issCheck.value.fromOthers > 0 && !iss.ack) { issAction.fail(t('Confirm that you’re issuing stock reserved to another project.')); return }
  if (issAction.run(issueStock(iss.item.id, iss.wpId, Number(iss.qty), iss.ack, asActor.value))) iss.open = false
}
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Stock availability')" />
    <div class="pm-stage">
      <div class="pm-filters">
        <div class="filter-left">
          <label class="pm-check">
            <MpCheckbox id="stock-only-contention" :is-checked="onlyContention" @change="onlyContention = !onlyContention" />
            <span>{{ t('Only contention') }}</span>
          </label>
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search item...')" />
          </div>
        </div>
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
                  <span class="pm-row pm-gap-2">
                    <MpIcon :name="expanded === r.i.id ? 'chevrons-down' : 'chevrons-right'" size="sm" />
                    <span class="pm-strong">{{ r.i.name }}</span>
                    <ErpStatusBadge v-if="r.contention" v-bind="badgeProps('flag', 'contention', t)" />
                    <ErpStatusBadge v-if="r.pending" status="pending" type="information" :label="`${r.pending} ${t('release request')}`" />
                  </span>
                </td>
                <td>{{ r.i.warehouse }}</td>
                <td class="pm-num">{{ num(r.i.onHand) }} {{ r.i.unit }}</td>
                <td class="pm-num">{{ num(r.reserved) }}</td>
                <td class="pm-num" :class="r.available <= 0 ? 'pm-neg' : ''">{{ num(r.available) }}</td>
                <td class="pm-wrap">
                  <span class="pm-row pm-gap-1">
                    <MpTag v-for="b in r.byProject" :id="`stock-${r.i.id}-${b.p.id}`" :key="b.p.id">{{ b.p.code }} · {{ num(b.qty) }}</MpTag>
                    <span v-if="!r.byProject.length" class="pm-muted">—</span>
                  </span>
                </td>
                <td><MpTextlink :id="`stock-issue-${r.i.id}`" as="a" @click.prevent.stop="openIssue(r.i)">{{ t('Issue') }}</MpTextlink></td>
              </tr>
              <tr v-if="expanded === r.i.id" class="pm-tr-sub">
                <td colspan="7">
                  <div class="pm-table-wrap">
                    <table class="pm-table">
                      <thead><tr><th>{{ t('Project') }}</th><th>{{ t('Priority') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Status') }}</th><th /></tr></thead>
                      <tbody>
                        <tr v-for="res in reservations.filter(x => x.itemId === r.i.id && (x.status === 'reserved' || x.status === 'picked'))" :key="res.id">
                          <td><MpTextlink :id="`stock-project-${res.id}`" as="a" @click.prevent="router.push(`/projects/${res.projectId}?tab=production`)">{{ getProject(res.projectId)?.code }}</MpTextlink> {{ getProject(res.projectId)?.name }}</td>
                          <td><ErpStatusBadge v-bind="badgeProps('priority', getProject(res.projectId)!.priority, t)" /></td>
                          <td>{{ getWorkPackage(res.wpId)?.code }} {{ getWorkPackage(res.wpId)?.name }}</td>
                          <td class="pm-num">{{ num(res.qty) }} {{ r.i.unit }}</td>
                          <td><ErpStatusBadge v-bind="badgeProps('res', res.status, t)" /></td>
                          <td><MpTextlink :id="`stock-request-${res.id}`" as="a" @click.prevent="openRequest(res.id)">{{ t('Request release') }}</MpTextlink></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-for="q in releaseRequests.filter(x => x.itemId === r.i.id)" :key="q.id" class="pm-row pm-gap-2 pm-small pm-mt-2">
                    <ErpStatusBadge v-bind="badgeProps('approval', q.status, t)" />
                    <span>{{ q.qty }} {{ r.i.unit }} {{ getProject(q.fromProjectId)?.code }} → {{ getProject(q.toProjectId)?.code }} — {{ q.reason }}</span>
                    <MpTextlink v-if="q.status === 'pending'" :id="`stock-inbox-${q.id}`" as="a" @click.prevent="router.push('/project-approvals')">{{ t('Open in Approvals') }}</MpTextlink>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p class="pm-caption pm-mt-2">
        {{ t('Issuing stock reserved to another project') }}: <strong>{{ projectPolicy.reservationIssuePolicy === 'block' ? t('Blocked') : t('Warned') }}</strong>.
        <template v-if="role !== 'warehouse'"> {{ t('Tip: switch “View as” to Warehouse to see this page the way warehouse staff do.') }}</template>
      </p>
    </div>

    <!-- Request release -->
    <PmOverlay id="stock-request-modal" :open="rq.open" variant="modal" :title="t('Request release')" :subtitle="rqRes ? `${getProject(rqRes.projectId)?.code} · ${num(rqRes.qty)} ${t('reserved')}` : ''" @close="rq.open = false">
      <MpBanner id="stock-request-note" variant="info">
        <MpBannerIcon /><MpBannerDescription>{{ t('A person decides. Priority is shown to them, but nothing is bumped automatically.') }}</MpBannerDescription>
      </MpBanner>
      <MpFormControl id="rq-wp-fc" is-required :is-invalid="rq.touched && !rq.toWp">
        <MpFormLabel>{{ t('For work package') }}</MpFormLabel>
        <ErpFilterSelect id="rq-wp" v-model="rq.toWp" :placeholder="t('Select work package')" :options="rqOptions" width="100%" :is-clearable="false" />
        <MpFormErrorMessage>{{ t('Select a work package.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="rq-q-fc" is-required :is-invalid="rq.touched && !Number(rq.qty)">
        <MpFormLabel>{{ t('Quantity') }}</MpFormLabel>
        <MpInput id="rq-q" v-model="rq.qty" class="pm-maxw-short" inputmode="numeric" />
        <MpFormErrorMessage>{{ t('Enter a quantity.') }}</MpFormErrorMessage>
      </MpFormControl>
      <MpFormControl id="rq-r-fc" is-required :is-invalid="rq.touched && !rq.reason.trim()">
        <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
        <MpTextarea id="rq-r" v-model="rq.reason" />
        <MpFormErrorMessage>{{ t('A reason is required.') }}</MpFormErrorMessage>
      </MpFormControl>
      <PmActionError id="stock-request-error" :error="rqAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="rq.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doRequest">{{ t('Send request') }}</MpButton>
      </template>
    </PmOverlay>

    <!-- Issue -->
    <PmOverlay id="stock-issue-modal" :open="iss.open" variant="modal" :title="t('Issue stock')" :subtitle="iss.item ? `${iss.item.name} · ${num(iss.item.onHand)} ${iss.item.unit} ${t('on hand')}` : ''" @close="iss.open = false">
      <MpFormControl id="is-wp-fc" is-required>
        <MpFormLabel>{{ t('To work package') }}</MpFormLabel>
        <ErpFilterSelect id="is-wp" v-model="iss.wpId" :placeholder="t('Select work package')" :options="issOptions" width="100%" :is-clearable="false" />
      </MpFormControl>
      <MpFormControl id="is-q-fc" is-required :is-invalid="iss.touched && !Number(iss.qty)">
        <MpFormLabel>{{ t('Quantity') }}</MpFormLabel>
        <MpInput id="is-q" v-model="iss.qty" class="pm-maxw-short" inputmode="numeric" />
        <MpFormErrorMessage>{{ t('Enter a quantity.') }}</MpFormErrorMessage>
      </MpFormControl>
      <template v-if="issCheck">
        <p class="pm-caption pm-m-0">{{ t('Reserved to this project') }}: {{ num(issCheck.own) }} · {{ t('free') }}: {{ num(issCheck.free) }}</p>
        <MpBanner v-if="issCheck.fromOthers" id="stock-issue-conflict" :variant="issCheck.policy === 'block' ? 'danger' : 'warning'">
          <MpBannerIcon />
          <MpBannerTitle>{{ num(issCheck.fromOthers) }} {{ iss.item?.unit }} {{ t('of this is reserved to another project') }}</MpBannerTitle>
          <MpBannerDescription>
            <div v-for="h in issCheck.holders" :key="h.project.id">{{ h.project.code }} · {{ h.project.name }} — {{ t('priority') }} {{ priorityLabel(h.project.priority) }} ({{ num(h.qty) }})</div>
            <template v-if="issCheck.policy === 'block'">{{ t('Company policy blocks this. Request a release instead.') }}</template>
          </MpBannerDescription>
        </MpBanner>
        <label v-if="issCheck.fromOthers && issCheck.policy !== 'block'" class="pm-check">
          <MpCheckbox id="is-ack" :is-checked="iss.ack" @change="iss.ack = !iss.ack" />
          <span>{{ t('Issue anyway — this is recorded in the audit log') }}</span>
        </label>
        <MpBanner v-if="!issCheck.fromOthers" id="stock-issue-ok" variant="info">
          <MpBannerIcon /><MpBannerDescription>{{ t('Covered by this project’s reservation and free stock.') }}</MpBannerDescription>
        </MpBanner>
      </template>
      <PmActionError id="stock-issue-error" :error="issAction.error.value" />
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="iss.open = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="doIssue">{{ t('Issue') }}</MpButton>
      </template>
    </PmOverlay>
  </div>
</template>
