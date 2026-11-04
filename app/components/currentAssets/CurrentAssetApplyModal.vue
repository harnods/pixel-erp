<!-- prod-parity: jurnal-accounting-frontend/src/modules/assets/views/AssetDepreciationView.vue (depreciation-confirm-modal) -->
<script setup lang="ts">
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton, MpButtonGroup, MpText,
} from '@mekari/pixel3'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'confirm'): void }>()
const { t } = useLocale()

function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm'); close() }
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="ca-apply-modal"
    :is-open="isOpen"
    size="md"
    :is-keep-alive="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Apply depreciation all at once?') }}</MpModalHeader>
      <MpModalBody>
        <div class="caam-body">
          <MpText>{{ t('Depreciating assets all at once will affect:') }}</MpText>
          <ul class="caam-effects">
            <li><MpText>{{ t('Decreasing the value of bookkeeping asset.') }}</MpText></li>
            <li><MpText>{{ t('Adding depreciation journal entry.') }}</MpText></li>
            <li><MpText>{{ t('Changes on Balance Sheet and Profit & Loss Report.') }}</MpText></li>
          </ul>
          <MpText weight="semiBold">{{ t("You can't return assets after applying depreciation.") }}</MpText>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ t('Apply') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.caam-body { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.caam-effects { margin: 0; list-style-type: disc; padding-left: var(--mp-spacing-5); }
</style>
