<script setup lang="ts">
/**
 * BudgetPRCard — the Budget card on a purchase request's detail page (PRD FG-3).
 * Status, the line check, the approval chain from the budget request, any
 * funding request and block, and the actions whoever is acting may take:
 * Approve / Reject for the waiting step (the final step may cut amounts and
 * holds the money), Request funds on a block, and Cancel request.
 */
import {
  MpButton, MpBanner, MpBannerIcon, MpBannerDescription, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpTextarea, MpTextlink,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import BudgetCheckPanel from '~/components/patterns/BudgetCheckPanel.vue'
import ApprovalLogModal from '~/components/patterns/ApprovalLogModal.vue'
import type { ApprovalLog } from '~/data/warehouseTransfers'
import {
  budget, actingPerson, prTotal, prRemaining, prWaitingStep, isFinalPRStep, canApprovePR, canCancelPR,
  approvePRAs, rejectPRAs, cancelPRAs, raiseFundingRequest, changeById, rupiah, canSeeBudgetAmounts,
  type BudgetPR,
} from '~/data/budgetStore'
import { budgetPanel, mixKey, prStatusKey, newLineRoute, type PanelRow } from '~/data/budgetUiPurchaseRequests'
import { updatePurchaseRequest } from '~/data/purchaseRequests'
import { formatIDRWhole } from '~/utils/currency'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ pr: BudgetPR; purchaseRequestId: string }>()

const { t } = useLocale()
const router = useRouter()

const person = computed(() => { void budget.viewAs; return actingPerson() })
const status = computed(() => props.pr.status)
const total = computed(() => prTotal(props.pr))

// ── The line check (requester sees only the lines this request charges) ──
const isHeldMode = computed(() => props.pr.status === 'Approved' || props.pr.status === 'Closed' || props.pr.status === 'Cancelled')
const panel = computed(() => budgetPanel(props.pr.lines.map((l) => ({ account: l.account, dept: l.dept, project: l.project, amount: l.amount })), props.pr.month))
const held = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  props.pr.lines.forEach((l, i) => { const k = mixKey(l); out[k] = (out[k] ?? 0) + prRemaining(props.pr.id, i) })
  return out
})
const heldTotal = computed(() => Object.values(held.value).reduce((s, v) => s + v, 0))
const orderedOn = computed(() => budget.pos.filter((po) => po.prId === props.pr.id).map((po) => po.number))

// ── Approval chain ──
const waiting = computed(() => prWaitingStep(props.pr))
const can = computed(() => canApprovePR(props.pr, person.value))
const isFinal = computed(() => isFinalPRStep(props.pr))
function stepLabel(s: { status: string }): string {
  if (s.status === 'Waiting' && props.pr.status !== 'Pending') return t('Not needed')
  if (s.status === 'Waiting' && waiting.value === s) return t('Waiting')
  if (s.status === 'Waiting') return t('Next')
  return t(s.status)
}
function stepType(s: { status: string }): 'completed' | 'warning' | 'critical' | 'announcement' {
  if (s.status === 'Approved') return 'completed'
  if (s.status === 'Rejected') return 'critical'
  if (s.status === 'Waiting' && props.pr.status === 'Pending' && waiting.value === s) return 'warning'
  return 'announcement'
}
// One-line chain summary; the full log opens in the shared Approval log modal.
const chainSummary = computed(() => {
  const c = props.pr.approvalChain
  if (!c.length) return ''
  const done = c.filter((s) => s.status === 'Approved').map((s) => s.approver)
  const rejected = c.find((s) => s.status === 'Rejected')
  if (rejected) return `${t('Rejected by')} ${rejected.approver}${rejected.note ? `: ${rejected.note}` : ''}`
  if (props.pr.status === 'Pending' && waiting.value) {
    const n = c.indexOf(waiting.value) + 1
    return `${t('Waiting for')} ${waiting.value.approver} · ${t('step')} ${n} ${t('of')} ${c.length}`
  }
  return done.length ? `${t('Approved by')} ${done.join(', ')}` : ''
})
const logOpen = ref(false)
defineExpose({ openLog: () => { logOpen.value = true } })
const approvalLog = computed<ApprovalLog>(() => ({
  requestedBy: props.pr.requester,
  requestedAt: `${props.pr.date}T09:00:00+07:00`,
  stages: props.pr.approvalChain.map((s) => ({
    title: s.role, rule: 'anyone' as const, approvers: [s.approver],
    approvals: s.status === 'Approved' && s.at ? [{ user: s.approver, date: s.at }] : [],
  })),
}))
const showAmounts = computed(() => canSeeBudgetAmounts(budget.viewAs))

function stepDate(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

// ── Funding request ──
const funding = computed(() => changeById(props.pr.fundingRequestId))

// ── Actions ──
const message = ref<{ kind: 'danger' | 'success'; text: string } | null>(null)
const cutOpen = ref(false)
const cuts = ref<number[]>([])
const cutError = ref('')
function openCuts() { cuts.value = props.pr.lines.map((l) => l.amount); cutError.value = ''; cutOpen.value = true }

function onApprove() {
  message.value = null
  const amounts = cutOpen.value && isFinal.value ? cuts.value.map((v) => Math.round(Number(v) || 0)) : undefined
  const res = approvePRAs(props.pr.id, person.value, amounts)
  if (!res.ok) {
    if (cutOpen.value) cutError.value = res.reason ?? ''
    else message.value = { kind: 'danger', text: res.reason ?? t('This request cannot be approved.') }
    return
  }
  cutOpen.value = false
  if (res.final) {
    updatePurchaseRequest(props.purchaseRequestId, { awaitingApproval: false })
    message.value = { kind: 'success', text: `${t('Approved.')} ${rupiah(res.held ?? 0)} ${t('is held on the budget.')}` }
    successToast(t('Purchase request approved'))
  } else {
    message.value = { kind: 'success', text: `${t('Approved. Waiting for')} ${res.next?.approver ?? ''}.` }
    successToast(t('Purchase request approved'))
  }
}

const rejectOpen = ref(false)
const rejectNote = ref('')
const rejectError = ref(false)
function onReject() {
  if (!rejectOpen.value) { rejectOpen.value = true; return }
  if (!rejectNote.value.trim()) { rejectError.value = true; return }
  const res = rejectPRAs(props.pr.id, rejectNote.value, person.value)
  if (!res.ok) { message.value = { kind: 'danger', text: res.reason ?? '' }; return }
  updatePurchaseRequest(props.purchaseRequestId, { awaitingApproval: false })
  rejectOpen.value = false
  rejectNote.value = ''
  message.value = null
  successToast(t('Purchase request rejected'))
}

const canCancel = computed(() => canCancelPR(props.pr, person.value))
const cancelConfirm = ref(false)
function onCancel() {
  if (!cancelConfirm.value) { cancelConfirm.value = true; return }
  const res = cancelPRAs(props.pr.id, person.value)
  cancelConfirm.value = false
  if (!res.ok) { message.value = { kind: 'danger', text: res.reason ?? '' }; return }
  updatePurchaseRequest(props.purchaseRequestId, { awaitingApproval: false, status: 'voided' })
  message.value = { kind: 'success', text: res.freed > 0 ? `${t('Request cancelled.')} ${rupiah(res.freed)} ${t('is back on the budget.')}` : t('Request cancelled.') }
  successToast(t('Purchase request cancelled'))
}

const isRequester = computed(() => person.value === props.pr.requester)
function onRequestFunds() {
  const fr = raiseFundingRequest(props.pr.id)
  router.push('/budget-changes/new?edit=' + fr.id)
}
function onRequestLine(r: PanelRow) { router.push(newLineRoute(r)) }
</script>

<template>
  <section class="bpc" data-tour="pr-budget-card">
    <header class="bpc__head">
      <div class="bpc__titlewrap">
        <h3 class="bpc__title">{{ t('Budget') }}</h3>
        <ErpStatusBadge :status="prStatusKey(status)" :label="t(status)" />
      </div>
    </header>

    <div class="bpc__body">
      <!-- Block -->
      <!-- A short line carries its own Request funds; the banner is for other blocks (no line, not locked). -->
      <MpBanner v-if="pr.block && (status === 'Draft' || status === 'Pending') && !(pr.block.lineId && pr.block.short > 0)" id="pr-detail-block" variant="danger" data-tour="pr-block-banner">
        <MpBannerIcon id="pr-detail-block-icon" />
        <MpBannerDescription>
          <span class="bpc__bannertext">{{ pr.block.short > 0 ? (showAmounts ? `${t('Not enough budget. Short')} ${formatIDRWhole(pr.block.short)}.` : t('Not enough budget.')) : t(pr.block.message) }}</span>
          <MpButton is-rounded v-if="status === 'Draft' && isRequester && pr.block.lineId && pr.block.short > 0" variant="secondary" data-tour="pr-request-funds" @click="onRequestFunds">{{ t('Request funds') }}</MpButton>
        </MpBannerDescription>
      </MpBanner>

      <!-- Over month reason (approvers see it) -->
      <p v-if="pr.overMonthReason && status !== 'Draft' && !pr.overMonthReason.startsWith('Funded by')" class="bpc__reason">
        <span class="bpc__label">{{ t('Reason for going over the month') }}</span>
        <span>{{ pr.overMonthReason }}</span>
      </p>

      <BudgetCheckPanel :rows="panel.rows" :month="pr.month" :mode="isHeldMode ? 'held' : 'after'" :held="held" :can-request-line="isRequester" :can-request-funds="status === 'Draft' && isRequester && !!pr.block" :submitted="status !== 'Draft'" @request-line="onRequestLine" @request-funds="onRequestFunds" />

      <p v-if="orderedOn.length" class="bpc__note">{{ t('Ordered on') }} {{ orderedOn.join(', ') }}. {{ t('The purchase order now holds the money.') }}</p>

      <!-- Funding request -->
      <div v-if="funding" class="bpc__funding">
        <span class="bpc__label">{{ t('Funding request') }}</span>
        <MpTextlink :id="`pr-funding-${funding.id}`" as="a" @click.prevent="router.push(`/budget-changes/${funding.id}`)">{{ funding.number }}</MpTextlink>
        <ErpStatusBadge :status="funding.status.toLowerCase()" :label="t(funding.status)" />
        <span class="bpc__muted">{{ formatIDRWhole(funding.donor?.amount ?? funding.receivers[0]?.amount ?? 0) }}</span>
      </div>

      <!-- Approval: one line; the full log opens in the Approval log modal -->
      <div v-if="pr.approvalChain.length" class="bpc__chain">
        <span class="bpc__label">{{ t('Approval') }}</span>
        <span class="bpc__chaintext">{{ chainSummary }}</span>
        <a class="bpc__link" @click="logOpen = true">{{ t('View approval log') }}</a>
      </div>
      <p v-else-if="status === 'Draft'" class="bpc__muted">{{ t('Not submitted yet.') }}</p>

      <!-- Inline result / refusal -->
      <MpBanner v-if="message" id="pr-budget-msg" :variant="message.kind">
        <MpBannerIcon id="pr-budget-msg-icon" />
        <MpBannerDescription>{{ message.text }}</MpBannerDescription>
      </MpBanner>

      <!-- Cut amounts (final approver) -->
      <div v-if="cutOpen && can.ok && isFinal" class="bpc__cuts">
        <div v-for="(l, i) in pr.lines" :key="i" class="bpc__cut">
          <MpFormControl :id="`pr-cut-${i}`" :is-invalid="!!cutError">
            <MpFormLabel>{{ t('Approved amount') }} · {{ l.description }}</MpFormLabel>
            <MpInput type="number" :model-value="cuts[i]" is-full-width @update:model-value="(v) => { cuts[i] = Number(v); cutError = '' }" />
          </MpFormControl>
        </div>
        <p v-if="cutError" class="bpc__error">{{ cutError }}</p>
      </div>

      <!-- Reject reason -->
      <MpFormControl v-if="rejectOpen && can.ok" id="pr-reject-note" is-required :is-invalid="rejectError" class="bpc__rejectnote">
        <MpFormLabel>{{ t('Reason for rejecting') }}</MpFormLabel>
        <MpTextarea id="pr-reject-note-inp" v-model="rejectNote" is-full-width :is-invalid="rejectError" @update:model-value="rejectError = false" />
        <MpFormErrorMessage>{{ t('Add a reason for the rejection') }}</MpFormErrorMessage>
      </MpFormControl>

      <p v-if="cancelConfirm" class="bpc__error">{{ status === 'Approved' ? `${t('Cancelling frees')} ${formatIDRWhole(heldTotal)} ${t('back to the budget. Click Cancel request again to confirm.')}` : t('Click Cancel request again to confirm.') }}</p>

      <p v-if="status === 'Pending' && !can.ok && !(can.reason ?? '').startsWith('Waiting for')" class="bpc__muted">{{ can.reason }}</p>

      <footer v-if="(status === 'Pending' && can.ok) || canCancel.ok" class="bpc__actions">
        <MpButton is-rounded v-if="canCancel.ok" variant="ghost" @click="onCancel">{{ t('Cancel request') }}</MpButton>
        <template v-if="status === 'Pending' && can.ok">
          <MpButton is-rounded v-if="isFinal && !cutOpen" variant="ghost" @click="openCuts">{{ t('Change amounts') }}</MpButton>
          <MpButton is-rounded variant="secondary" @click="onReject">{{ t('Reject') }}</MpButton>
          <MpButton is-rounded variant="primary" data-tour="pr-approve" @click="onApprove">{{ t('Approve') }}</MpButton>
        </template>
      </footer>
    </div>
    <ApprovalLogModal :is-open="logOpen" :subject="pr.number" :log="approvalLog" @close="logOpen = false" />
  </section>
</template>

<style scoped>
.bpc { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-colors-background-neutral, #fff); flex-shrink: 0; }
.bpc__head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.bpc__titlewrap { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.bpc__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpc__sum { display: flex; align-items: baseline; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.bpc__sumlabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bpc__sumvalue { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-right: var(--mp-spacing-4); }
.bpc__body { padding: var(--mp-spacing-3) var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bpc__bannertext { font-weight: var(--mp-font-weights-semi-bold); margin-right: var(--mp-spacing-4); }
.bpc__reason { margin: 0; display: flex; align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bpc__note { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bpc__label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; }
.bpc__muted { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bpc__funding { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.bpc__chain { display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-3); }
.bpc__chaintext { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bpc__link { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.bpc__link:hover { text-decoration: underline; text-underline-offset: 2px; }
.bpc__steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bpc__step {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.bpc__stepno {
  display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0;
  border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.bpc__stepwho { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.bpc__stepname { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bpc__stepnote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.bpc__cuts { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--mp-spacing-3); }
.bpc__error { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
.bpc__rejectnote { max-width: 640px; }
.bpc__actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); }
</style>
