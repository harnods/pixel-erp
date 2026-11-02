<script setup lang="ts">
/**
 * Upgrade reason — opened by Save on the Edit BOM form when the edited version is
 * already used by a work order (or is an inactive version). It explains why the
 * save becomes a new version (same bill of materials, same code) and asks for the
 * reason (10–500 characters, inline error). Nothing is saved until the user
 * confirms here; work orders already created keep their version.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpBanner, MpBannerIcon, MpBannerDescription,
  MpFormControl, MpFormLabel, MpTextarea, MpFormHelpText, MpFormErrorMessage,
} from '@mekari/pixel3'
import { VERSION_REASON_MIN, VERSION_REASON_MAX, type BomContent } from '~/data/billOfMaterials'

const props = defineProps<{
  isOpen: boolean; bomId: string; nextVersion: number; content?: BomContent
  /** the version being edited, how many work orders use it, and whether it's an inactive one */
  currentVersion?: number; refs?: number; fromSuperseded?: boolean
}>()
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()
const { t } = useLocale()

// Fresh reason every time the modal opens.
const reason = ref('')
const reasonError = ref('')
watch(() => props.isOpen, (o) => { if (o) { reason.value = ''; reasonError.value = '' } })
function confirm() {
  const n = reason.value.trim().length
  reasonError.value = n < VERSION_REASON_MIN
    ? t('Reason is required (min 10 characters)')
    : n > VERSION_REASON_MAX ? t('Reason can be at most 500 characters') : ''
  if (!reasonError.value) emit('confirm', reason.value)
}
</script>

<template>
  <MpModal
    id="bom-new-version-modal" :is-open="isOpen" size="md"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" :is-keep-alive="false"
    @close="emit('close')"
  >
    <MpModalContent data-devchange="bom-version-impact">
      <MpModalHeader>{{ t('Save as') }} v{{ nextVersion }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody class="bvm-body">
        <MpBanner id="bvm-why" variant="info">
          <MpBannerIcon />
          <MpBannerDescription>
            <template v-if="fromSuperseded">v{{ currentVersion }} {{ t('is an inactive version, so your changes are saved as a new version') }} v{{ nextVersion }}.</template>
            <template v-else>v{{ currentVersion }} {{ t('is already used by') }} {{ refs }} {{ t('work order(s), so your changes are saved as a new version') }} v{{ nextVersion }}.</template>
            {{ t('Same bill of materials and code.') }}
          </MpBannerDescription>
        </MpBanner>
        <MpFormControl id="bvm-reason" is-required :is-invalid="!!reasonError" data-devchange="bom-version-reason">
          <MpFormLabel>{{ t('Reason for new version') }}</MpFormLabel>
          <MpTextarea id="bvm-reason-input" v-model="reason" @update:model-value="reasonError = ''" />
          <MpFormHelpText v-if="!reasonError">{{ t('Why is this revision needed? (min 10 characters)') }} · {{ reason.trim().length }}/{{ VERSION_REASON_MAX }}</MpFormHelpText>
          <MpFormErrorMessage>{{ reasonError }}</MpFormErrorMessage>
        </MpFormControl>
        <p class="bvm-caption">{{ t('Work orders already created keep the version they were created from. Only work orders created after saving use') }} v{{ nextVersion }}.</p>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ t('Save') }} v{{ nextVersion }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.bvm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.bvm-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
</style>
