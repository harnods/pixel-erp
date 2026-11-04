<script setup lang="ts">
/**
 * Confirm a manual match whose two sides don't agree to the rupiah (design
 * review P0). Matching a pair with a difference files a real PPN gap as
 * "Reconciled", so it is never one click: the modal states the difference and
 * asks why, and the reason is kept on the match's Activity (goal G4).
 *
 * Structured like RejectTransactionModal: closes only via × / Cancel
 * (rule/modal-drawer-close-explicit-only), the primary is never disabled — an
 * empty reason shows an inline error instead (rule/form-errors-inline).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpTextarea, MpButton,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{
  isOpen: boolean
  /** The row the user is matching FROM (invoice number, or faktur number). */
  rowRef: string
  rowTotal: number
  candidateRef: string
  candidateTotal: number
}>()

const emit = defineEmits<{
  close: []
  confirm: [reason: string]
}>()

const { t } = useLocale()

const MAX_CHARS = 256
const reason = ref('')
const touched = ref(false)
const isInvalid = computed(() => touched.value && reason.value.trim() === '')
const difference = computed(() => props.rowTotal - props.candidateTotal)

function handleConfirm() {
  touched.value = true
  if (reason.value.trim() === '') return
  emit('confirm', reason.value.trim())
}

watch(() => props.isOpen, (open) => {
  if (!open) { reason.value = ''; touched.value = false }
})
</script>

<template>
  <MpModal
    id="vat-recon-match-confirm-modal"
    :is-open="isOpen"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    size="sm"
    :is-keep-alive="false"
    @close="emit('close')"
  >
    <MpModalContent data-devchange="vat-recon-review-fixes">
      <MpModalHeader>
        {{ t('Confirm match with a difference?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="vmc-description">
          {{ t('The two sides do not agree. Confirming records this pair as reconciled with the difference below.') }}
        </p>
        <dl class="vmc-kv">
          <dt>{{ rowRef }}</dt><dd>{{ formatIDR(rowTotal) }}</dd>
          <dt>{{ candidateRef }}</dt><dd>{{ formatIDR(candidateTotal) }}</dd>
          <dt class="vmc-diff-label">{{ t('Difference') }}</dt>
          <dd class="vmc-diff">{{ formatIDR(Math.abs(difference)) }}</dd>
        </dl>
        <div class="vmc-field">
          <div class="vmc-label-row">
            <label class="vmc-label" for="vmc-reason">{{ t('Reason') }}<span class="vmc-required">*</span></label>
            <span class="vmc-count">{{ reason.length }} / {{ MAX_CHARS }}</span>
          </div>
          <MpTextarea
            id="vmc-reason"
            v-model="reason"
            :maxlength="MAX_CHARS"
            :rows="3"
            is-full-width
            :is-invalid="isInvalid"
          />
          <p v-if="isInvalid" class="vmc-error" role="alert">{{ t('Enter why this pair matches despite the difference.') }}</p>
          <p v-else class="vmc-helper">{{ t('Saved on the match activity, for audit.') }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="vmc-actions">
          <MpButton class="btn-enterprise btn-enterprise--ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" is-rounded @click="handleConfirm">{{ t('Confirm match') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.vmc-description { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.vmc-kv {
  margin: 0 0 var(--mp-spacing-4);
  display: grid; grid-template-columns: minmax(0, 1fr) auto; row-gap: var(--mp-spacing-1); column-gap: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
}
.vmc-kv dt { color: var(--mp-text-secondary); overflow-wrap: anywhere; }
.vmc-kv dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.vmc-diff-label { font-weight: var(--mp-font-weights-semi-bold); }
.vmc-diff { color: var(--mp-colors-red-800); font-weight: var(--mp-font-weights-semi-bold); }
.vmc-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.vmc-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.vmc-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vmc-required { color: var(--mp-colors-red-800); margin-left: 2px; }
.vmc-count, .vmc-helper { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); margin: 0; }
.vmc-error { font-size: var(--mp-font-sizes-xs); color: var(--mp-colors-red-800); margin: 0; }
.vmc-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
