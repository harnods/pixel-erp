<script setup lang="ts">
/**
 * A budget change record (FG-4): what moves, the approval chain and its step
 * status, Approve / Reject for the person whose step waits, Withdraw for the
 * preparer, and the posted version once approved.
 */
import { MpTextlink, MpButton, MpTextarea, MpFormControl, MpFormLabel, MpFormErrorMessage, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import BudgetChangeChain from '~/components/patterns/BudgetChangeChain.vue'
import { formatIDRWhole } from '~/utils/currency'
import { formatDateLong, formatDateTimeLong } from '~/utils/date'
import { successToast } from '~/utils/toasts'
import {
  budget, actingPerson, changeById, changeTotal, changeHeld, canApproveChange, approveChange, rejectChange, canEditChange,
  canWithdrawChange, withdrawChangeAs, prById, prLink, prTotal, lineById, yearFigures, BUDGET_YEAR,
} from '~/data/budgetStore'
import {
  lineName, receiverName, monthLabel, approvedAt, sliceLabel, waitingStep,
} from '~/data/budgetUiChanges'

const props = defineProps<{ orderId: string }>()

const { t } = useLocale()
const router = useRouter()

const change = computed(() => { void budget.changes.length; return changeById(props.orderId) })
const person = computed(() => { void budget.viewAs; return actingPerson() })

interface MoveRow { from: string; fromId: string | null; to: string; toId: string | null; amount: number; month: string }
const moves = computed<MoveRow[]>(() => {
  const c = change.value
  if (!c) return []
  return c.receivers.map((r) => ({
    from: c.donor ? lineName(c.donor.lineId) : c.kind === 'Revision' ? t(r.amount < 0 ? 'Cut' : 'Added') : '-',
    fromId: c.donor?.lineId ?? null,
    to: receiverName(r),
    toId: r.lineId,
    amount: r.amount,
    month: monthLabel(c.month),
  }))
})
const total = computed(() => (change.value ? (change.value.kind === 'Revision' ? change.value.receivers.reduce((s, r) => s + r.amount, 0) : changeTotal(change.value)) : 0))
const held = computed(() => { void budget.entries.length; return change.value ? changeHeld(change.value.id) : 0 })

const can = computed(() => (change.value ? canApproveChange(change.value, person.value) : { ok: false }))
const step = computed(() => (change.value ? waitingStep(change.value) : null))
const withdrawable = computed(() => (change.value ? canWithdrawChange(change.value).ok : false))
const editable = computed(() => (change.value ? canEditChange(change.value).ok : false))

const linkedPr = computed(() => prById(change.value?.linkedPrId ?? null))
const version = computed(() => {
  const c = change.value
  if (!c || c.version === null) return null
  return budget.versions.find((v) => v.year === BUDGET_YEAR && v.no === c.version) ?? null
})
const versionLines = computed(() => {
  const v = version.value
  if (!v) return []
  const by = new Map<string, number>()
  v.changes.forEach((ch) => by.set(ch.lineId, (by.get(ch.lineId) ?? 0) + ch.delta))
  return [...by.entries()].map(([lineId, delta]) => ({ lineId, name: lineName(lineId), delta, available: lineById(lineId) ? yearFigures(lineId).available : 0 }))
})

// ── Decide ─────────────────────────────────────────────────────────────────
const rejecting = ref(false)
const note = ref('')
const noteError = ref('')
const actionError = ref('')

function approve() {
  actionError.value = ''
  const res = approveChange(props.orderId, person.value)
  if (!res.ok) { actionError.value = res.reason ?? ''; return }
  successToast(change.value?.status === 'Approved' ? t('Approved and posted') : t('Approved. Sent to the next approver.'))
}
function startReject() {
  actionError.value = ''
  const check = change.value ? canApproveChange(change.value, person.value) : { ok: false, reason: '' }
  if (!check.ok) { actionError.value = check.reason ?? ''; return }
  rejecting.value = true
}
function confirmReject() {
  noteError.value = ''
  if (!note.value.trim()) { noteError.value = t('Add a note for the preparer.'); return }
  const res = rejectChange(props.orderId, note.value.trim(), person.value)
  if (!res.ok) { actionError.value = res.reason ?? ''; return }
  rejecting.value = false
  note.value = ''
  successToast(t('Rejected. The donor hold is freed.'))
}
function withdraw() {
  actionError.value = ''
  const res = withdrawChangeAs(props.orderId)
  if (!res.ok) { actionError.value = res.reason ?? ''; return }
  successToast(t('Change withdrawn'))
}
function goLine(id: string | null) { if (id && lineById(id)) router.push(`/budget-lines/${id}`) }
</script>

<template>
  <div class="bcd-page">
    <header class="bcd-bar">
      <div class="bcd-bar-left">
        <MpTextlink id="bcd-breadcrumb" as="a" class="bcd-breadcrumb" @click.prevent="router.push('/budget-changes')">{{ t('Budget changes') }}</MpTextlink>
        <div class="bcd-titlerow">
          <h1 class="bcd-title">{{ change ? `${t(change.kind)} ${change.number}` : t('Budget change') }}</h1>
          <ErpStatusBadge v-if="change" :status="change.status.toLowerCase()" :label="t(change.status)" badge-for="additionalInformation" size="md" />
        </div>
      </div>
      <div v-if="change" class="bcd-actions">
        <button v-if="editable" class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push({ path: '/budget-changes/new', query: { edit: change.id } })">{{ t('Edit draft') }}</button>
        <button v-if="withdrawable" class="btn-enterprise btn-enterprise--ghost" type="button" @click="withdraw">{{ t('Withdraw') }}</button>
        <template v-if="change.status === 'Pending'">
          <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="startReject">{{ t('Reject') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" data-tour="change-approve" @click="approve">{{ t('Approve') }}</button>
        </template>
      </div>
    </header>

    <div class="bcd-stage">
      <p v-if="!change" class="bcd-error">{{ t('This change no longer exists.') }}</p>
      <template v-else>
        <!-- Who can act -->
        <MpBanner v-if="change.status === 'Pending' && !can.ok" id="bcd-wait" variant="info" align-items="center">
          <MpBannerIcon id="bcd-wait-icon" />
          <MpBannerDescription>{{ can.reason }}</MpBannerDescription>
        </MpBanner>
        <p v-if="actionError" class="bcd-error" role="alert">{{ actionError }}</p>

        <!-- Reject with note -->
        <section v-if="rejecting" class="bcd-card bcd-reject">
          <MpFormControl id="bcd-note" is-required :is-invalid="!!noteError">
            <MpFormLabel>{{ t('Reason for rejecting') }}</MpFormLabel>
            <MpTextarea id="bcd-note-input" v-model="note" :rows="3" is-full-width :is-invalid="!!noteError" @update:model-value="noteError = ''" />
            <MpFormErrorMessage>{{ noteError }}</MpFormErrorMessage>
          </MpFormControl>
          <div class="bcd-reject__actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="rejecting = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" type="button" @click="confirmReject">{{ t('Reject change') }}</button>
          </div>
        </section>

        <!-- Summary -->
        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Amount') }}</div>
            <div class="stat-period">{{ monthLabel(change.month) }}</div>
            <div class="stat-amount">{{ formatIDRWhole(total) }}</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Held for transfers') }}</div>
            <div class="stat-period">{{ t('On the donor line · as of today') }}</div>
            <div class="stat-amount">{{ formatIDRWhole(held) }}</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Waiting for') }}</div>
            <div class="stat-period">{{ step ? t(step.role) : t('No step waiting') }}</div>
            <div class="stat-amount">{{ step ? step.approver : '-' }}</div>
          </div>
          <div class="stat-card" data-tour="change-version">
            <div class="stat-title">{{ t('Posted version') }}</div>
            <div class="stat-period">{{ version ? formatDateTimeLong(version.at) : t('Posts on final approval') }}</div>
            <div class="stat-amount">{{ version ? `${t('Version')} ${version.no}` : '-' }}</div>
            <a v-if="version && versionLines[0]" class="stat-link" @click="goLine(versionLines[versionLines.length - 1]!.lineId)">{{ t('View line') }}</a>
          </div>
        </div>

        <section class="bcd-summary">
          <ContentList :label="t('Kind')" :value="t(change.kind)" />
          <ContentList :label="t('Prepared by')" :value="change.preparedBy" />
          <ContentList :label="t('Created')" :value="formatDateLong(change.createdAt)" />
          <ContentList :label="t('Submitted')" :value="change.submittedAt ? formatDateTimeLong(change.submittedAt) : '-'" />
          <ContentList v-if="change.reasonCode" :label="t('Reason code')" :value="t(change.reasonCode)" />
          <ContentList v-if="change.saving" :label="change.kind === 'Saving draw' ? t('Slice') : t('Saving tag')" :value="sliceLabel(change.saving)" />
          <ContentList v-if="change.saving?.sourceDoc" :label="t('Source document')" :value="change.saving.sourceDoc" />
          <ContentList v-if="change.status === 'Approved'" :label="t('Approved')" :value="formatDateTimeLong(approvedAt(change))" />
          <ContentList :label="t('Reason')" :value="change.reason || '-'" class="bcd-summary__wide" />
        </section>

        <!-- Funding request: the purchase request -->
        <section v-if="change.kind === 'Funding request'" class="bcd-section">
          <h2 class="bcd-h">{{ t('Purchase request') }}</h2>
          <div v-if="linkedPr" class="bcd-card bcd-pr">
            <ContentList :label="t('Request')">
              <a class="cell-link" @click="router.push(prLink(linkedPr))">{{ linkedPr.number }}</a>
            </ContentList>
            <ContentList :label="t('Requester')" :value="linkedPr.requester" />
            <ContentList :label="t('Request total')" :value="formatIDRWhole(prTotal(linkedPr))" />
            <ContentList :label="t('Gap')" :value="linkedPr.block ? formatIDRWhole(linkedPr.block.short) : '-'" />
            <ContentList :label="t('Request status')">
              <ErpStatusBadge :status="linkedPr.status.toLowerCase()" :label="t(linkedPr.status)" />
            </ContentList>
          </div>
          <p v-else class="bcd-hint">{{ t('No purchase request is linked.') }}</p>
        </section>

        <!-- Lines -->
        <section class="bcd-section">
          <h2 class="bcd-h">{{ t('Lines') }}</h2>
          <div class="bcd-table-wrap">
            <table class="bcd-table">
              <colgroup><col /><col /><col class="bcd-col-amt" /><col class="bcd-col-month" /></colgroup>
              <thead>
                <tr>
                  <th class="bcd-th">{{ t('From') }}</th>
                  <th class="bcd-th">{{ t('To') }}</th>
                  <th class="bcd-th bcd-th--num">{{ t('Amount') }}</th>
                  <th class="bcd-th">{{ t('Month') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in moves" :key="i">
                  <td class="bcd-td"><span :class="{ 'cell-link': !!m.fromId }" @click="goLine(m.fromId)">{{ m.from }}</span></td>
                  <td class="bcd-td"><span :class="{ 'cell-link': !!m.toId }" @click="goLine(m.toId)">{{ m.to }}</span></td>
                  <td class="bcd-td bcd-td--num">{{ formatIDRWhole(m.amount) }}</td>
                  <td class="bcd-td">{{ m.month }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Chain -->
        <BudgetChangeChain :steps="change.chain" :empty-text="change.status === 'Draft' ? t('The chain routes when the change is submitted.') : t('No approval steps.')" />

        <!-- Posted version -->
        <section v-if="version" class="bcd-section">
          <h2 class="bcd-h">{{ t('Version') }} {{ version.no }}</h2>
          <p class="bcd-hint">{{ t('Approved by') }} {{ version.approvedBy }} · {{ formatDateTimeLong(version.at) }}</p>
          <div class="bcd-table-wrap">
            <table class="bcd-table">
              <colgroup><col /><col class="bcd-col-amt" /><col class="bcd-col-amt" /></colgroup>
              <thead>
                <tr>
                  <th class="bcd-th">{{ t('Budget line') }}</th>
                  <th class="bcd-th bcd-th--num">{{ t('Change') }}</th>
                  <th class="bcd-th bcd-th--num">{{ t('Available now') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in versionLines" :key="v.lineId">
                  <td class="bcd-td"><span class="cell-link" @click="goLine(v.lineId)">{{ v.name }}</span></td>
                  <td class="bcd-td bcd-td--num">{{ formatIDRWhole(v.delta) }}</td>
                  <td class="bcd-td bcd-td--num">{{ formatIDRWhole(v.available) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bcd-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.bcd-bar { flex: none; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.bcd-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.bcd-breadcrumb { align-self: flex-start; background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); }
.bcd-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.bcd-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.bcd-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); white-space: nowrap; }
.bcd-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.bcd-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.bcd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bcd-h { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.bcd-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bcd-error { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
.bcd-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.bcd-reject { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bcd-reject__actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }
.bcd-pr { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--mp-spacing-4); }

.bcd-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 var(--mp-spacing-6); }
.bcd-summary__wide { grid-column: 1 / -1; }

.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }

.bcd-table-wrap { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px); overflow-x: auto; }
.bcd-table { width: 100%; min-width: 640px; table-layout: fixed; border-collapse: collapse; }
.bcd-col-amt { width: 184px; }
.bcd-col-month { width: 160px; }
.bcd-th { height: var(--mp-sizes-8, 32px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.bcd-th--num { text-align: right; }
.bcd-td { padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top; }
tr:last-child > .bcd-td { border-bottom: none; }
.bcd-td--num { text-align: right; white-space: nowrap; }
</style>
