<script setup lang="ts">
/**
 * Cancel work order — PRD v0.5 UC-09, UC-15 R-6.
 *
 * Cancelling is available once a work order has STARTED (before that it is
 * deleted, not cancelled) and takes a mandatory reason. Cancelling releases the
 * whole remaining reservation automatically — no disposition is asked for, because
 * the cancellation reason already carries the context (R-2) — and deletes the work
 * order's stock adjustments, reversing consumption so stock returns to the
 * condition it would be in had the job never existed.
 *
 * The confirmation NAMES both numbers (R-6). "Are you sure?" is not a decision
 * anyone can make here: the whole question is how much stock moves, and a user who
 * has to guess that will either cancel something they shouldn't or refuse to
 * cancel something they should.
 *
 * The stock request is not deleted with the job — it stays on the dashboard as
 * Canceled (W-3), because a request that vanishes reads as one that was never
 * raised.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpTextarea, MpIcon,
} from '@mekari/pixel3'

const props = defineProps<{
  id: string
  isOpen: boolean
  workOrderNumber: string
  /** qty that will return from Reserved to Available */
  releasedQty: number
  /** qty that will be restored by deleting the work order's stock adjustments */
  restoredQty: number
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'cancel-work-order', reason: string): void
}>()

const { t } = useLocale()

const reason = ref('')
const error = ref('')

watch(() => props.isOpen, (open) => {
  if (!open) return
  reason.value = ''
  error.value = ''
})
watch(reason, () => { error.value = '' })

// Footer actions always rendered and never disabled
// (rule/form-actions-always-present); a missing reason explains itself inline.
function submit() {
  if (!reason.value.trim()) {
    error.value = t('Give a reason for cancelling this work order.')
    return
  }
  emit('cancel-work-order', reason.value.trim())
}
</script>

<template>
  <MpModal
    :id="id" :is-open="isOpen" size="md" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false"
    @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Cancel work order') }}?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="cw-lead">
          {{ workOrderNumber }} {{ t('will be cancelled. This cannot be undone.') }}
        </p>

        <!-- R-6 — name what will be reversed, in figures. -->
        <div class="cw-effects">
          <div class="cw-effect">
            <MpIcon name="information" size="sm" />
            <span v-if="releasedQty > 0">
              <strong>{{ releasedQty }}</strong> {{ t('unit will be released from reservation and returned to available stock.') }}
            </span>
            <span v-else>{{ t('Nothing is currently reserved, so no stock is released.') }}</span>
          </div>
          <div class="cw-effect">
            <MpIcon name="information" size="sm" />
            <span v-if="restoredQty > 0">
              <strong>{{ restoredQty }}</strong> {{ t('unit already issued will be restored by deleting this work order\'s stock adjustments.') }}
            </span>
            <span v-else>{{ t('No material has been issued, so there are no stock adjustments to reverse.') }}</span>
          </div>
        </div>

        <p v-if="restoredQty > 0" class="cw-note">
          {{ t('The system will count that material in the warehouse again — anything physically on the production floor still has to be brought back.') }}
        </p>

        <div class="cw-field">
          <label class="cw-label" :for="`${id}-reason`">{{ t('Reason to cancel') }}</label>
          <MpTextarea
            :id="`${id}-reason`" v-model="reason" size="md" :rows="3"
            :placeholder="t('Why is this work order being cancelled?')"
          />
        </div>

        <p v-if="error" class="cw-error">{{ error }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="cw-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Close') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" type="button" @click="submit">{{ t('Cancel work order') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.cw-lead { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #080d0e); }

.cw-effects { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cw-effect {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749);
}

.cw-note {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749);
}

.cw-field { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cw-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #080d0e); }

.cw-error {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-critical, #a8352d);
}

.cw-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
</style>
