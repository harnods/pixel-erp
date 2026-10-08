<script setup lang="ts">
/**
 * WoTransactionModal — work order start, adjustment, (gated) completion and cancel/close
 * from the Work order detail page. Work order approval (PRD Rev 2):
 *   • a pre-submit notice names level 1's approvers whenever the transaction is gated,
 *     and the primary becomes "Submit for approval" — the change is saved as a request
 *     and nothing is applied until final approval;
 *   • a non-gated transaction applies immediately, exactly as before;
 *   • `prefill` ("Create again") re-opens a rejected request with its data and reason.
 *
 * STAND-IN: the prototype had no adjust form, so this minimal modal covers it. The adjustable fields
 * follow the PRD's prototype default (planned output qty) — never the BOM. Rev 3: an
 * adjustment needs a reason and the adjustment date; Cancel/close (7th type) settles the
 * work order and releases its remaining reservation once approved. Start (MVP): no fields,
 * just the pre-submit notice — material is reserved when the start is approved.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage, MpInput, MpTextarea, MpButton, MpButtonGroup, MpDatePicker,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import { persistWorkOrders, type WorkOrder } from '~/data/workOrders'
import {
  preSubmitApprovers, submitRequest, guardMessage, joinNames, rejectionOf,
  type WoApprovalRequest,
} from '~/data/woApproval'
import { formatDateTimeLong } from '~/utils/date'

export type WoTransactionMode = 'start' | 'adjustment' | 'completion' | 'cancel'

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
  /** 'submitted' = held for approval · 'applied' = executed now */
  done: [result: 'submitted' | 'applied']
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


watch(() => props.isOpen, (open) => {
  if (!open) return
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
}, { immediate: true })

const gatedApprovers = computed(() => preSubmitApprovers(props.mode, props.requester))
const rejection = computed(() => (props.prefill ? rejectionOf(props.prefill) : undefined))
const qtyLabel = computed(() => props.mode === 'adjustment' ? t('Planned qty') : t('Final produced qty'))

function close() { emit('update:isOpen', false) }

function submit() {
  qtyError.value = ''
  formError.value = ''
  noteError.value = ''
  dateError.value = ''
  const guard = guardMessage(props.workOrder.id, props.mode === 'completion' || props.mode === 'cancel' ? 'complete' : 'transaction')
  if (guard) { formError.value = guard; return }

  // Start — no fields; material is reserved once the start is approved.
  if (props.mode === 'start') {
    if (gatedApprovers.value) {
      const req = submitRequest({ workOrderId: props.workOrder.id, type: 'start', requester: props.requester, payload: {} })
      if (req) { close(); emit('done', 'submitted'); return }
    }
    close()
    emit('startNow')
    return
  }

  if (props.mode === 'cancel') {
    if (gatedApprovers.value) {
      const req = submitRequest({ workOrderId: props.workOrder.id, type: 'cancel', requester: props.requester, payload: { note: note.value.trim() || undefined } })
      if (req) { close(); emit('done', 'submitted'); return }
    }
    close()
    emit('cancelNow')
    return
  }

  const n = Number(qty.value)
  let invalid = false
  if (!qty.value || !Number.isFinite(n) || n <= 0) { qtyError.value = t('You must fill in qty'); invalid = true }
  if (props.mode === 'adjustment') {
    if (!adjustmentDate.value) { dateError.value = t('You must select a date'); invalid = true }
    if (!note.value.trim()) { noteError.value = t('You must fill in reason for adjustment'); invalid = true }
  }
  if (invalid) return

  if (gatedApprovers.value) {
    const payload = props.mode === 'adjustment'
      ? { plannedQty: n, note: note.value.trim(), adjustmentDate: fromDMY(adjustmentDate.value), changes: [{ field: 'Planned qty', from: String(props.workOrder.plannedQty), to: String(n) }] }
      : { producedQty: n }
    const req = submitRequest({
      workOrderId: props.workOrder.id, type: props.mode, requester: props.requester, payload,
      transactionDate: props.mode === 'adjustment' ? fromDMY(adjustmentDate.value) : undefined,
    })
    if (req) { close(); emit('done', 'submitted'); return }
  }

  // Normal flow — no rule gates it, so it executes now exactly as today.
  if (props.mode === 'completion') { close(); emit('completeNow'); return }
  const wo = props.workOrder
  if (props.mode === 'adjustment') wo.plannedQty = n
  persistWorkOrders()
  close()
  emit('done', 'applied')
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
          <MpBanner v-if="gatedApprovers" variant="info">
            <MpBannerIcon />
            <MpBannerDescription>{{ t('This transaction needs approval from level 1: {names}.').replace('{names}', joinNames(gatedApprovers)) }}</MpBannerDescription>
          </MpBanner>

          <p v-if="mode === 'adjustment'" class="wtm-helper">{{ t('Changes apply to this work order only. The bill of materials stays the same') }}</p>
          <p v-if="mode === 'start'" class="wtm-body-text">{{ t('The work order moves to In progress and its material is reserved once the start is approved.') }}</p>
          <p v-if="mode === 'cancel'" class="wtm-body-text">{{ t('The work order will be cancelled or closed and its remaining material reservation released.') }}</p>

          <MpFormControl v-if="mode === 'adjustment'" id="wtm-date" is-required :is-invalid="!!dateError">
            <MpFormLabel>{{ t('Adjustment date') }}</MpFormLabel>
            <MpDatePicker id="wtm-date-input" v-model="adjustmentDate" format="DD/MM/YYYY" value-type="format" use-portal is-clearable @update:model-value="dateError = ''" />
            <MpFormErrorMessage>{{ dateError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl v-if="mode !== 'cancel' && mode !== 'start'" id="wtm-qty" is-required :is-invalid="!!qtyError">
            <MpFormLabel>{{ qtyLabel }}</MpFormLabel>
            <MpInput id="wtm-qty-input" v-model="qty" type="number" is-full-width @update:model-value="qtyError = ''" />
            <MpFormErrorMessage>{{ qtyError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl v-if="mode === 'adjustment' || mode === 'cancel'" id="wtm-note" :is-required="mode === 'adjustment'" :is-invalid="!!noteError">
            <MpFormLabel>{{ mode === 'adjustment' ? t('Reason for adjustment') : t('Reason') }}</MpFormLabel>
            <MpTextarea id="wtm-note-input" v-model="note" :rows="3" :maxlength="256" is-full-width @update:model-value="noteError = ''" />
            <MpFormHelpText v-if="mode === 'adjustment' && !noteError">{{ t('Shown to the approver in the approval log') }}</MpFormHelpText>
            <MpFormErrorMessage>{{ noteError }}</MpFormErrorMessage>
          </MpFormControl>

          <p v-if="formError" class="wtm-error" role="alert">{{ t(formError) }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton :variant="mode === 'cancel' && !gatedApprovers ? 'danger' : 'primary'" is-rounded @click="submit">{{ gatedApprovers ? t('Submit for approval') : t(PRIMARY[mode]) }}</MpButton>
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
