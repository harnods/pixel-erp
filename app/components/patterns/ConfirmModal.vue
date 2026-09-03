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
  confirmLabel?: string
  cancelLabel?: string
  isDanger?: boolean
}>(), {
  description: '',
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
  <MpModal
    :id="modalId"
    :is-open="isOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ title }}</MpModalHeader>
      <MpModalBody>
        <MpText v-if="description">{{ description }}</MpText>
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
