<script setup lang="ts">
/**
 * Generic confirm dialog (delete / destructive-action confirmation), built on
 * the Pixel `MpModal` so every confirmation across the app shares one dialog
 * chrome (overlay, focus trap, esc/overlay close, top-aligned position).
 *
 * `is-centered` is left at its default (false) so the dialog sits near the top
 * of the viewport — the house style for alert/confirm dialogs.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton, MpButtonGroup, MpText,
} from '@mekari/pixel3'

withDefaults(defineProps<{
  isOpen: boolean
  title: string
  description?: string
  /** Optional detail lines listed under the description — one per affected record,
   *  so a confirmation about several things stays scannable instead of running
   *  the same sentence together N times. */
  items?: string[]
  confirmLabel?: string
  cancelLabel?: string
  isDanger?: boolean
}>(), {
  description: '',
  items: () => [],
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  isDanger: true,
})
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm'): void
}>()

// Unique per instance so two confirm dialogs on one page never share an id.
let _seq = 0
const modalId = `confirm-modal-${(_seq += 1)}-${Math.floor(performance.now())}`

function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm'); close() }
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    :id="modalId"
    :is-open="isOpen"
    size="md"
    :is-keep-alive="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ title }}</MpModalHeader>
      <MpModalBody>
        <MpText v-if="description">{{ description }}</MpText>
        <ul v-if="items.length" class="cm-items">
          <li v-for="item in items" :key="item">{{ item }}</li>
        </ul>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ cancelLabel }}</MpButton>
          <MpButton :variant="isDanger ? 'danger' : 'primary'" is-rounded @click="confirm">{{ confirmLabel }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* The global reset strips list-style, so the marker is set back explicitly. */
.cm-items {
  list-style: disc outside;
  margin: var(--mp-spacing-3) 0 0;
  padding-left: var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.cm-items li { display: list-item; }
.cm-items li + li { margin-top: var(--mp-spacing-1); }
</style>
