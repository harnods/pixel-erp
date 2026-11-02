<script setup lang="ts">
/**
 * Routing save confirmation — first step of Complete work order on a tracked work
 * order (Figma: Track routing › routing done confirmation). Asks whether the field
 * process matched the work order: adjust it first, or carry on and close it.
 */
import {
  MpButton, MpIcon, MpModal, MpModalBody, MpModalCloseButton, MpModalContent, MpModalHeader, MpModalOverlay,
} from '@mekari/pixel3'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'adjust'): void; (e: 'save'): void }>()
const { t } = useLocale()
</script>

<template>
  <MpModal
    id="routing-confirm-modal" :is-open="isOpen" size="lg" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Routing save confirmation') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="rc-choices">
          <section class="rc-choice">
            <span class="rc-icon rc-icon--adjust"><MpIcon name="edit" size="md" /></span>
            <h3 class="rc-title">{{ t('Found a difference?') }}</h3>
            <p class="rc-desc">{{ t('Adjust if the production process in the field differs from the work order.') }}</p>
            <MpButton variant="secondary" is-rounded @click="emit('adjust')">{{ t('Adjust work order') }}</MpButton>
          </section>
          <section class="rc-choice">
            <span class="rc-icon rc-icon--save"><MpIcon name="check" size="md" /></span>
            <h3 class="rc-title">{{ t('Everything matches?') }}</h3>
            <p class="rc-desc">{{ t('Save the routing if the process in the field matches the work order.') }}</p>
            <MpButton variant="secondary" is-rounded @click="emit('save')">{{ t('Save routing') }}</MpButton>
          </section>
        </div>
      </MpModalBody>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.rc-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rc-choice { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); text-align: center; }
.rc-choice + .rc-choice { border-left: 1px solid var(--mp-border-default); }
.rc-icon { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: var(--mp-radii-lg); }
.rc-icon--adjust { background: var(--mp-background-information-subtle, #eaf1fb); color: var(--mp-colors-text-information, #4b61dc); }
.rc-icon--save { background: var(--mp-background-success-subtle, #e7f5ef); color: var(--mp-colors-text-success, #0f6d4d); }
.rc-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rc-desc { flex: 1; margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
</style>
