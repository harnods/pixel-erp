<script setup lang="ts">
/**
 * WoTransactionModal — the confirmation for every work order action that can need
 * approval: Start, Adjust, Complete and Cancel/close (Work order detail page).
 *
 * Grooming 2026-10-09:
 *   • on open it asks VAL which approval rule applies (useValApprovalRule — a stand-in
 *     client with a real loading / error state) and shows the answer in a blue info
 *     banner; the primary becomes "Submit for approval" when the rule gates it;
 *   • Adjust and Cancel/close need a reason — kept on the work order and shown in a
 *     notice on the detail page after submit;
 *   • when VAL says every level would be skipped (the requester is the only approver),
 *     the banner says so and the action is approved automatically on submit;
 *   • a non-gated action applies immediately, exactly as before;
 *   • `prefill` ("Create again" / "Submit again") re-opens a rejected request with its
 *     data and the rejection reason.
 *
 * STAND-IN: the prototype had no adjust form, so this minimal modal covers it. The
 * adjustable field is the planned output qty — never the BOM.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage, MpInput, MpTextarea, MpButton, MpButtonGroup, MpDatePicker,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink, MpSpinner,
} from '@mekari/pixel3'
import { persistWorkOrders, type WorkOrder } from '~/data/workOrders'
import {
  submitRequest, guardMessage, joinNames, rejectionOf, recordActionReason, dismissRejection,
  type WoApprovalRequest,
} from '~/data/woApproval'
import { useValApprovalRule } from '~/data/valApprovalRule'
import { formatDateTimeLong } from '~/utils/date'

export type WoTransactionMode = 'start' | 'adjustment' | 'completion' | 'cancel'
/** 'submitted' = held for approval · 'applied' = executed now · 'auto-approved' = every level skipped */
export type WoTransactionResult = 'submitted' | 'applied' | 'auto-approved'

const props = defineProps<{
  isOpen: boolean
  mode: WoTransactionMode
  workOrder: WorkOrder
  requester: string
  /** Rejected request to pre-fill from ("Create again"). */
  prefill?: WoApprovalRequest | null
}>()
const emit = defineEmits<{
  'update:isOpen': [v: boolean]
  done: [result: WoTransactionResult, mode: WoTransactionMode]
  /** Not gated completion — the page runs its existing completion flow instead. */
  completeNow: []
  /** Not gated cancel/close — applied immediately. */
  cancelNow: []
  /** Not gated start — the page starts the work order now. */
  startNow: []
}>()

const { t } = useLocale()

const TITLES: Record<WoTransactionMode, string> = {
  start: 'Start work order?',
  adjustment: 'Adjust work order',
  completion: 'Complete work order',
  cancel: 'Cancel/close work order?',
}
const PRIMARY: Record<WoTransactionMode, string> = {
  start: 'Start work order',
  adjustment: 'Save changes',
  completion: 'Complete',
  cancel: 'Cancel/close work order',
}

const qty = ref('')
const note = ref('')
const qtyError = ref('')
const noteError = ref('')
const adjustmentDate = ref('') // DD/MM/YYYY
const dateError = ref('')
const formError = ref('')

const toDMY = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }
const fromDMY = (v: string) => { const [d, m, y] = v.split('/'); return `${y}-${m}-${d}` }

// ── VAL — which approval rule applies ────────────────────────────────────────
const val = useValApprovalRule()
function loadRule() {
  formError.value = ''
  val.load({ module: 'work-order', transactionType: props.mode, requester: props.requester })
}

watch(() => props.isOpen, (open) => {
  if (!open) { val.reset(); return }
  qtyError.value = ''
  noteError.value = ''
  dateError.value = ''
  formError.value = ''
  const p = props.prefill?.payload
  // "Create again" keeps the original transaction date (still editable).
  adjustmentDate.value = toDMY(p?.adjustmentDate ?? props.prefill?.transactionDate ?? new Date().toISOString())
  if (props.mode === 'adjustment') { qty.value = String(p?.plannedQty ?? props.workOrder.plannedQty); note.value = p?.note ?? '' }
  if (props.mode === 'cancel') { qty.value = ''; note.value = p?.note ?? '' }
  if (props.mode === 'completion') { qty.value = String(p?.producedQty ?? props.workOrder.plannedQty); note.value = '' }
  loadRule()
}, { immediate: true })

const gated = computed(() => !!val.rule.value?.gated)
const autoApproved = computed(() => !!val.rule.value?.autoApproved)
const needsApproval = computed(() => gated.value && !autoApproved.value)
const bannerText = computed(() => {
  const first = val.rule.value?.firstLevel
  if (!first) return ''
  // Level 1 keeps the existing staging wording.
  return first.level === 1
    ? t('This transaction needs approval from level 1: {names}.').replace('{names}', joinNames(first.approvers))
    : t('This transaction needs approval from level {n}: {names}.').replace('{n}', String(first.level)).replace('{names}', joinNames(first.approvers))
})

const rejection = computed(() => (props.prefill ? rejectionOf(props.prefill) : undefined))
const qtyLabel = computed(() => props.mode === 'adjustment' ? t('Planned qty') : t('Final produced qty'))
const noteRequired = computed(() => props.mode === 'adjustment' || props.mode === 'cancel')

function close() { emit('update:isOpen', false) }

function finish(req: WoApprovalRequest | null): boolean {
  if (!req) return false
  // Acting on a rejection ("Create again") clears its notice.
  if (props.prefill) dismissRejection(props.prefill.id)
  if (noteRequired.value) {
    recordActionReason(props.workOrder, { type: props.mode as 'adjustment' | 'cancel', reason: note.value.trim(), by: props.requester, requestId: req.id })
  }
  close()
  emit('done', req.status === 'executed' ? 'auto-approved' : 'submitted', props.mode)
  return true
}

function submit() {
  qtyError.value = ''
  formError.value = ''
  noteError.value = ''
  dateError.value = ''
  // Buttons are never disabled — explain instead.
  if (val.loading.value) { formError.value = 'Wait until the approval rule has loaded.'; return }
  if (val.error.value || !val.rule.value) { formError.value = 'The approval rule couldn\'t be loaded. Try again before you continue.'; return }
  const guard = guardMessage(props.workOrder.id)
  if (guard) { formError.value = guard; return }

  const n = Number(qty.value)
  let invalid = false
  if (props.mode === 'adjustment' || props.mode === 'completion') {
    if (!qty.value || !Number.isFinite(n) || n <= 0) { qtyError.value = t('You must fill in qty'); invalid = true }
  }
  if (props.mode === 'adjustment' && !adjustmentDate.value) { dateError.value = t('You must select a date'); invalid = true }
  if (props.mode === 'adjustment' && !note.value.trim()) { noteError.value = t('You must fill in reason for adjustment'); invalid = true }
  if (props.mode === 'cancel' && !note.value.trim()) { noteError.value = t('You must fill in reason for cancel/close'); invalid = true }
  if (invalid) return

  if (gated.value) {
    const payload = props.mode === 'adjustment'
      ? { plannedQty: n, note: note.value.trim(), adjustmentDate: fromDMY(adjustmentDate.value), changes: [{ field: 'Planned qty', from: String(props.workOrder.plannedQty), to: String(n) }] }
      : props.mode === 'completion' ? { producedQty: n }
        : props.mode === 'cancel' ? { note: note.value.trim() }
          : {}
    const req = submitRequest({
      workOrderId: props.workOrder.id, type: props.mode, requester: props.requester, payload,
      transactionDate: props.mode === 'adjustment' ? fromDMY(adjustmentDate.value) : undefined,
    })
    if (finish(req)) return
  }

  // Normal flow — no rule gates it, so it executes now exactly as today.
  if (props.prefill) dismissRejection(props.prefill.id)
  if (props.mode === 'start') { close(); emit('startNow'); return }
  if (props.mode === 'completion') { close(); emit('completeNow'); return }
  if (props.mode === 'cancel') {
    recordActionReason(props.workOrder, { type: 'cancel', reason: note.value.trim(), by: props.requester })
    close()
    emit('cancelNow')
    return
  }
  props.workOrder.plannedQty = n
  persistWorkOrders()
  recordActionReason(props.workOrder, { type: 'adjustment', reason: note.value.trim(), by: props.requester })
  close()
  emit('done', 'applied', props.mode)
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="wo-transaction-modal" :is-open="isOpen" size="md" :is-keep-alive="false" @close="close"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t(TITLES[mode]) }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="wtm-body" data-devchange="wo-approval-forms">
          <MpBanner v-if="rejection" variant="danger">
            <MpBannerIcon />
            <MpBannerTitle>{{ t('Request rejected') }}</MpBannerTitle>
            <MpBannerDescription>
              {{ t('{name} rejected this on {timestamp}. Reason: {reason}. Fix the details and submit again.')
                .replace('{name}', rejection.user).replace('{timestamp}', formatDateTimeLong(rejection.at)).replace('{reason}', rejection.reason ?? '') }}
            </MpBannerDescription>
          </MpBanner>

          <!-- Approval rule from VAL — loading / error / gated / auto-approved -->
          <MpBanner v-if="val.loading.value" variant="info" role="status" data-devchange="wo-approval-val">
            <MpSpinner size="sm" />
            <MpBannerDescription>{{ t('Checking the approval rule…') }}</MpBannerDescription>
          </MpBanner>
          <MpBanner v-else-if="val.error.value" variant="danger" data-devchange="wo-approval-val">
            <MpBannerIcon />
            <MpBannerDescription>{{ t('The approval rule couldn\'t be loaded.') }}</MpBannerDescription>
            <MpBannerLink><MpButton variant="textLink" size="sm" @click="loadRule">{{ t('Try again') }}</MpButton></MpBannerLink>
          </MpBanner>
          <MpBanner v-else-if="autoApproved" variant="info" data-devchange="wo-approval-val">
            <MpBannerIcon />
            <MpBannerDescription>{{ t('You\'re the only approver for this transaction, so it\'s approved automatically when you submit.') }}</MpBannerDescription>
          </MpBanner>
          <MpBanner v-else-if="gated" variant="info" data-devchange="wo-approval-val">
            <MpBannerIcon />
            <MpBannerDescription>{{ bannerText }}</MpBannerDescription>
          </MpBanner>

          <p v-if="mode === 'adjustment'" class="wtm-helper">{{ t('Changes apply to this work order only. The bill of materials stays the same') }}</p>
          <p v-if="mode === 'start'" class="wtm-body-text">{{ needsApproval ? t('The work order moves to In progress and its material is reserved once the start is approved.') : t('The work order moves to In progress and its material is reserved.') }}</p>
          <p v-if="mode === 'cancel'" class="wtm-body-text">{{ t('The work order will be cancelled or closed and its remaining material reservation released.') }}</p>

          <MpFormControl v-if="mode === 'adjustment'" id="wtm-date" is-required :is-invalid="!!dateError">
            <MpFormLabel>{{ t('Adjustment date') }}</MpFormLabel>
            <MpDatePicker id="wtm-date-input" v-model="adjustmentDate" format="DD/MM/YYYY" value-type="format" use-portal is-clearable @update:model-value="dateError = ''" />
            <MpFormErrorMessage>{{ dateError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl v-if="mode === 'adjustment' || mode === 'completion'" id="wtm-qty" is-required :is-invalid="!!qtyError">
            <MpFormLabel>{{ qtyLabel }}</MpFormLabel>
            <MpInput id="wtm-qty-input" v-model="qty" type="number" is-full-width @update:model-value="qtyError = ''" />
            <MpFormErrorMessage>{{ qtyError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl v-if="noteRequired" id="wtm-note" is-required :is-invalid="!!noteError">
            <MpFormLabel>{{ mode === 'adjustment' ? t('Reason for adjustment') : t('Reason for cancel/close') }}</MpFormLabel>
            <MpTextarea id="wtm-note-input" v-model="note" :rows="3" :maxlength="256" is-full-width @update:model-value="noteError = ''" />
            <MpFormHelpText v-if="!noteError">{{ t('Shown on the work order and in the approval log') }}</MpFormHelpText>
            <MpFormErrorMessage>{{ noteError }}</MpFormErrorMessage>
          </MpFormControl>

          <p v-if="formError" class="wtm-error" role="alert">{{ t(formError) }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton :variant="mode === 'cancel' && !needsApproval ? 'danger' : 'primary'" is-rounded @click="submit">{{ needsApproval ? t('Submit for approval') : t(PRIMARY[mode]) }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.wtm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.wtm-body-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.wtm-helper { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.wtm-error { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
