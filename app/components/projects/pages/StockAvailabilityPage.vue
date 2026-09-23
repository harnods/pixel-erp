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
  MpIcon, MpButton, MpInput, MpTextarea, MpToggle, MpTag, MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpCheckbox,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmMenu from '../PmMenu.vue'
import PmOverlay from '../PmOverlay.vue'
import PmActionError from '../PmActionError.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
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

const onlyContention = ref(false)
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// Row = the item's stock position; the per-project breakdown opens in a drawer
// (as batch reservations do elsewhere) rather than a table nested inside a row.
interface Row {
  id: string; item: string; warehouse: string; unit: string; onHand: number; reserved: number
  available: number; byProject: { p: ReturnType<typeof getProject>; qty: number }[]
  contention: boolean; pending: number; status: string; i: StockItem
}
const allRows = computed<Row[]>(() => stockItems.map(i => {
  const byProject = [...reservedByProject(i.id).entries()].map(([pid, q]) => ({ p: getProject(pid)!, qty: q })).sort((a, b) => b.qty - a.qty)
  const pending = releaseRequests.filter(r => r.itemId === i.id && r.status === 'pending').length
  const available = availableQty(i.id)
  return {
    id: i.id, item: i.name, warehouse: i.warehouse, unit: i.unit, onHand: i.onHand, reserved: reservedQty(i.id),
    available, byProject, contention: byProject.length > 1 && available < i.onHand * 0.15, pending,
    status: byProject.length > 1 && available < i.onHand * 0.15 ? t('Contention') : pending ? t('Release request') : '',
    i,
  }
}))

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Row>(allRows, {
  perPage: 25,
  defaultSort: { key: 'item', dir: 'asc' },
  filterFn: (r, s) => (!s || r.item.toLowerCase().includes(s) || r.warehouse.toLowerCase().includes(s))
    && (!onlyContention.value || r.contention || !!r.pending),
})
watch(onlyContention, () => setPage(1))
function clearFilters() { onlyContention.value = false; search.value = '' }

const columns = computed<TableColumn[]>(() => [
  { key: 'item', label: t('Item'), kind: 'name', sortType: 'text' },
  { key: 'warehouse', label: t('Warehouse'), kind: 'name', sortType: 'text' },
  { key: 'onHand', label: t('On hand'), align: 'right', sortType: 'number' },
  { key: 'reserved', label: t('Reserved'), align: 'right', sortType: 'number' },
  { key: 'available', label: t('Available'), align: 'right', sortType: 'number' },
  { key: 'byProject', label: t('Reserved by project'), kind: 'tags', sortType: 'number' },
  { key: 'status', label: t('Status'), kind: 'status', sortType: 'text' },
])
const asRow = (r: unknown) => r as Row
const priorityLabel = (p: string) => t(p === 'high' ? 'High' : p === 'medium' ? 'Medium' : 'Low')

// ── Reservations drawer (the old inline accordion) ──
const detailId = ref('')
const detail = computed(() => allRows.value.find(r => r.id === detailId.value))
const detailReservations = computed(() => (detail.value ? reservations.filter(x => x.itemId === detail.value!.id && (x.status === 'reserved' || x.status === 'picked')) : []))
const detailRequests = computed(() => (detail.value ? releaseRequests.filter(x => x.itemId === detail.value!.id) : []))
function openDetail(r: Row) { detailId.value = r.id }
function closeDetail() { detailId.value = '' }

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
  detailId.value = ''
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
        :has-active-filter="onlyContention"
        :search="search"
        filter-empty-label="item"
        actions-align-top
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <label class="pm-toggle-field">
              <MpToggle id="stock-only-contention" v-model:is-checked="onlyContention" :aria-label="t('Show only contention')" />
              <span>{{ t('Show only contention') }}</span>
            </label>
          </div>
          <div class="filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search item...')" />
            </div>
          </div>
        </template>

        <template #cell-item="{ row }">
          <span class="cell-link" role="link" tabindex="0" @click.stop="openDetail(asRow(row))" @keydown.enter="openDetail(asRow(row))">{{ asRow(row).item }}</span>
        </template>
        <template #cell-status="{ row }">
          <div v-if="asRow(row).contention || asRow(row).pending" class="pm-stack pm-gap-1">
            <ErpStatusBadge v-if="asRow(row).contention" v-bind="badgeProps('flag', 'contention', t)" />
            <ErpStatusBadge v-if="asRow(row).pending" status="pending" type="information" :label="`${asRow(row).pending} ${t('release request')}`" />
          </div>
          <span v-else class="pm-muted">—</span>
        </template>
        <template #cell-onHand="{ row }">{{ num(asRow(row).onHand) }} {{ asRow(row).unit }}</template>
        <template #cell-reserved="{ row }">{{ num(asRow(row).reserved) }}</template>
        <template #cell-available="{ row }">
          <span :class="asRow(row).available <= 0 ? 'pm-neg' : ''">{{ num(asRow(row).available) }}</span>
        </template>
        <template #cell-byProject="{ row }">
          <span v-if="asRow(row).byProject.length" class="pm-row pm-gap-1">
            <MpTag v-for="b in asRow(row).byProject" :id="`stock-${asRow(row).id}-${b.p!.id}`" :key="b.p!.id">{{ b.p!.code }} · {{ num(b.qty) }}</MpTag>
          </span>
          <span v-else class="pm-muted">—</span>
        </template>

        <template #actions="{ row }">
          <PmMenu :id="`stock-row-${asRow(row).id}`" kebab :label="t('More actions')" :items="[
            { label: t('View reservations'), action: () => openDetail(asRow(row)), disabledReason: asRow(row).byProject.length ? undefined : t('Nothing is reserved on this item') },
            { label: t('Issue stock'), action: () => openIssue(asRow(row).i) },
          ]" />
        </template>

        <template #empty>
          <div class="pm-empty-inline">
            <div class="pm-empty-title">{{ t('No items') }}</div>
            <div class="pm-empty-desc">{{ t('Items will appear here.') }}</div>
          </div>
        </template>
      </ErpTablePage>
      <p class="pm-caption pm-mt-2">
        {{ t('Issuing stock reserved to another project') }}: <strong>{{ projectPolicy.reservationIssuePolicy === 'block' ? t('Blocked') : t('Warned') }}</strong>.
        <template v-if="role !== 'warehouse'"> {{ t('Tip: switch “View as” to Warehouse to see this page the way warehouse staff do.') }}</template>
      </p>
    </div>

    <!-- Reservations on one item — who holds what, and the release requests against it -->
    <PmOverlay id="stock-detail" :open="!!detail" wide :title="detail?.item ?? ''" @close="closeDetail">
      <template v-if="detail">
        <div class="pm-grid-4">
          <div><div class="pm-stat-label">{{ t('Warehouse') }}</div><div class="pm-body">{{ detail.warehouse }}</div></div>
          <div><div class="pm-stat-label">{{ t('On hand') }}</div><div class="pm-body">{{ num(detail.onHand) }} {{ detail.unit }}</div></div>
          <div><div class="pm-stat-label">{{ t('Reserved') }}</div><div class="pm-body">{{ num(detail.reserved) }} {{ detail.unit }}</div></div>
          <div><div class="pm-stat-label">{{ t('Available') }}</div><div class="pm-body" :class="detail.available <= 0 ? 'pm-neg' : ''">{{ num(detail.available) }} {{ detail.unit }}</div></div>
        </div>

        <div>
          <h3 class="pm-h3 pm-mb-2">{{ t('Reserved by project') }}</h3>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th>{{ t('Project') }}</th><th>{{ t('Priority') }}</th><th>{{ t('Work package') }}</th><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('Status') }}</th><th class="pm-cell-sticky-action" /></tr></thead>
              <tbody>
                <tr v-for="res in detailReservations" :key="res.id">
                  <td><MpTextlink :id="`stock-project-${res.id}`" as="a" @click.prevent="router.push(`/projects/${res.projectId}?tab=production`)">{{ getProject(res.projectId)?.code }}</MpTextlink> {{ getProject(res.projectId)?.name }}</td>
                  <td><ErpStatusBadge v-bind="badgeProps('priority', getProject(res.projectId)!.priority, t)" /></td>
                  <td>{{ getWorkPackage(res.wpId)?.code }} {{ getWorkPackage(res.wpId)?.name }}</td>
                  <td class="pm-num">{{ num(res.qty) }} {{ detail.unit }}</td>
                  <td><ErpStatusBadge v-bind="badgeProps('res', res.status, t)" /></td>
                  <td class="pm-cell-actions pm-cell-sticky-action"><MpTextlink :id="`stock-request-${res.id}`" as="a" @click.prevent="openRequest(res.id)">{{ t('Request release') }}</MpTextlink></td>
                </tr>
                <tr v-if="!detailReservations.length"><td colspan="6"><div class="pm-empty-inline">{{ t('Nothing is reserved on this item') }}</div></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="detailRequests.length">
          <h3 class="pm-h3 pm-mb-2">{{ t('Release requests') }}</h3>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <thead><tr><th class="pm-num">{{ t('Qty') }}</th><th>{{ t('From') }}</th><th>{{ t('To') }}</th><th>{{ t('Reason') }}</th><th>{{ t('Status') }}</th><th class="pm-cell-sticky-action" /></tr></thead>
              <tbody>
                <tr v-for="q in detailRequests" :key="q.id">
                  <td class="pm-num">{{ num(q.qty) }} {{ detail.unit }}</td>
                  <td>{{ getProject(q.fromProjectId)?.code }}</td>
                  <td>{{ getProject(q.toProjectId)?.code }}</td>
                  <td class="pm-wrap"><div class="pm-clamp-text">{{ q.reason }}</div></td>
                  <td><ErpStatusBadge v-bind="badgeProps('approval', q.status, t)" /></td>
                  <td class="pm-cell-actions pm-cell-sticky-action"><MpTextlink v-if="q.status === 'pending'" :id="`stock-inbox-${q.id}`" as="a" @click.prevent="router.push('/project-approvals')">{{ t('Open approvals') }}</MpTextlink></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="closeDetail">{{ t('Close') }}</MpButton>
        <MpButton v-if="detail" id="stock-detail-issue" variant="primary" is-rounded @click="openIssue(detail.i)">{{ t('Issue stock') }}</MpButton>
      </template>
    </PmOverlay>

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
