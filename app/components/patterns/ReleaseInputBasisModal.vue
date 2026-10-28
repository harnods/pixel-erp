<script setup lang="ts">
/**
 * ReleaseInputBasisModal — releases a sales order line from its PERCENT input
 * basis (PRD OD-003 / R-16).
 *
 * The release is one way: the line becomes Quantity permanently. That is why the
 * reason is required and the warning is explicit rather than a passing note —
 * there is no undo, and the trail is the only record of why the basis changed.
 * Closes only via ×, like every other ERP modal.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpText, MpFormControl, MpFormLabel, MpFormErrorMessage, MpTextarea,
} from '@mekari/pixel3'

const props = defineProps<{ isOpen: boolean; lineLabel: string; lockedBy: string }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', reason: string): void
}>()

const { t } = useLocale()

let _seq = 0
const uid = `${(_seq += 1)}-${Math.floor(performance.now())}`
const modalId = `release-basis-modal-${uid}`

const REASON_MAX = 256
const reason = ref('')
const error = ref('')

watch(() => props.isOpen, (open) => { if (open) { reason.value = ''; error.value = '' } })

function close() { emit('update:isOpen', false) }
function confirm() {
  const r = reason.value.trim()
  if (!r) { error.value = t('You must fill in reason for release'); return }
  emit('confirm', r)
  close()
}
</script>

<template>
  <MpModal :id="modalId" :is-open="isOpen" size="md" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>
        {{ t('Release input method') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="rib-body">
          <MpText>{{ lineLabel }} {{ t('is locked to Percentage by') }} {{ lockedBy }}.</MpText>
          <MpText>{{ t('Releasing it is permanent. The line becomes Quantity and cannot go back to Percentage.') }}</MpText>
          <MpFormControl :id="`rib-reason-${uid}`" is-required :is-invalid="!!error">
            <MpFormLabel>{{ t('Reason for release') }}</MpFormLabel>
            <MpTextarea :id="`rib-reason-input-${uid}`" v-model="reason" :maxlength="REASON_MAX" :rows="3"
              is-full-width :is-invalid="!!error" @update:model-value="error = ''" />
            <MpFormErrorMessage>{{ error }}</MpFormErrorMessage>
          </MpFormControl>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton is-rounded variant="ghost" @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton is-rounded variant="danger" @click="confirm">{{ t('Release') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.rib-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
</style>
