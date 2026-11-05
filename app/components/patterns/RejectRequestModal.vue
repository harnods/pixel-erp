<script setup lang="ts">
/**
 * RejectRequestModal — an approver rejects a pending Project accounting request
 * (project creation, addendum, milestone verification). The reason is required
 * and shown to the submitter; the error shows inline on confirm.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpText, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpTextarea,
} from '@mekari/pixel3'

const props = defineProps<{ isOpen: boolean; title: string; subject: string }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'confirm', reason: string): void }>()

const { t } = useLocale()

let _seq = 0
const uid = `${(_seq += 1)}-${Math.floor(performance.now())}`
const modalId = `reject-request-modal-${uid}`

const REASON_MAX = 256
const reason = ref('')
const error = ref('')

watch(() => props.isOpen, (open) => { if (open) { reason.value = ''; error.value = '' } })

function close() { emit('update:isOpen', false) }
function confirm() {
  const r = reason.value.trim()
  if (!r) { error.value = t('You must fill in reason for rejection'); return }
  emit('confirm', r)
  close()
}
</script>

<template>
  <MpModal :id="modalId" :is-open="isOpen" size="md" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>
        {{ title }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="rrm-body">
          <MpText v-if="subject">{{ subject }}</MpText>
          <MpFormControl :id="`rrm-reason-${uid}`" is-required :is-invalid="!!error">
            <div class="rrm-label-row">
              <MpFormLabel>{{ t('Reason for rejection') }}</MpFormLabel>
              <span class="rrm-count">{{ reason.length }} / {{ REASON_MAX }}</span>
            </div>
            <MpTextarea :id="`rrm-reason-input-${uid}`" v-model="reason" :maxlength="REASON_MAX" :rows="3"
              is-full-width :is-invalid="!!error" @update:model-value="error = ''" />
            <MpFormErrorMessage>{{ error }}</MpFormErrorMessage>
            <MpFormHelpText v-if="!error">{{ t('The submitter sees this reason.') }}</MpFormHelpText>
          </MpFormControl>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="danger" is-rounded @click="confirm">{{ t('Reject') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.rrm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.rrm-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.rrm-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
</style>
