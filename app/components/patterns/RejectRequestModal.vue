<script setup lang="ts">
/** STUB on the review-fix base so pages can wire against the contract. The overlays agent replaces this file. */
import { MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpButton, MpButtonGroup, MpText } from '@mekari/pixel3'
defineProps<{ isOpen: boolean; title: string; subject: string }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'confirm', reason: string): void }>()
function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm', 'Rejected'); close() }
</script>

<template>
  <MpModal id="rejectrequestmodal" :is-open="isOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>Reject</MpModalHeader>
      <MpModalBody><MpText>Stub</MpText></MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">Reject</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>
