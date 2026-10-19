<script setup lang="ts">
/**
 * ReopenProjectModal — reopening a closed project needs a reason, which goes to
 * the project's audit log. The reason is required: the error shows inline on
 * confirm (the button stays clickable, rule/btn-no-disabled-validation).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpText, MpFormControl, MpFormLabel, MpFormErrorMessage, MpTextarea,
} from '@mekari/pixel3'

const props = defineProps<{ isOpen: boolean; projectName: string }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'confirm', reason: string): void }>()

const { t } = useLocale()

let _seq = 0
const uid = `${(_seq += 1)}-${Math.floor(performance.now())}`
const modalId = `reopen-project-modal-${uid}`

const REASON_MAX = 256
const reason = ref('')
const error = ref('')

watch(() => props.isOpen, (open) => { if (open) { reason.value = ''; error.value = '' } })

function close() { emit('update:isOpen', false) }
function confirm() {
  const r = reason.value.trim()
  if (!r) { error.value = t('Enter a reason for reopening'); return }
  emit('confirm', r)
  close()
}
</script>

<template>
  <MpModal :id="modalId" :is-open="isOpen" size="md" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>
        {{ t('Reopen project?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="rpm-body">
          <MpText>{{ projectName }} {{ t('goes back to In progress. Costs and invoices can be recorded against it again.') }}</MpText>
          <MpFormControl :id="`rpm-reason-${uid}`" is-required :is-invalid="!!error">
            <div class="rpm-label-row">
              <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
              <span class="rpm-count">{{ reason.length }} / {{ REASON_MAX }}</span>
            </div>
            <MpTextarea :id="`rpm-reason-input-${uid}`" v-model="reason" :maxlength="REASON_MAX" :rows="3"
              is-full-width :is-invalid="!!error" @update:model-value="error = ''" />
            <MpFormErrorMessage>{{ error }}</MpFormErrorMessage>
          </MpFormControl>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ t('Reopen project') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.rpm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.rpm-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.rpm-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
</style>
