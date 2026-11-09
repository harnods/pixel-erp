<script setup lang="ts">
/**
 * Confirm a manual match whose two sides don't agree to the rupiah (design
 * review P0). Matching a pair with a difference files a real PPN gap as
 * "Reconciled", so it is never one click: the modal states the difference and
 * the user confirms it.
 *
 * No free-text reason (VR-6): the BE stores none on a manual match. A reason
 * for a row belongs in its Remarks (US-013), which any non-auto row offers.
 *
 * Closes only via × / Cancel (rule/modal-drawer-close-explicit-only).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpButton,
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
  confirm: []
}>()

const { t } = useLocale()

const difference = computed(() => props.rowTotal - props.candidateTotal)
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
        <p class="vmc-helper" data-devchange="vat-recon-prd-align-match-reason">{{ t('To record why, add a remark to the row after matching.') }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="vmc-actions">
          <MpButton class="btn-enterprise btn-enterprise--ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" is-rounded @click="emit('confirm')">{{ t('Confirm match') }}</MpButton>
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
.vmc-helper { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); margin: 0; }
.vmc-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
