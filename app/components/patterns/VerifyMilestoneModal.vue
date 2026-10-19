<script setup lang="ts">
/** STUB on the review-fix base so pages can wire against the contract. The overlays agent replaces this file. */
import { MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpButton, MpButtonGroup, MpText } from '@mekari/pixel3'
import type { MilestoneVerificationInput } from '~/data/projectAccounting'
const props = defineProps<{ isOpen: boolean; milestoneLabel: string; amount: number; defaultVerifier: string; today: string; needsApproval: boolean; approverNames: string[] }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'confirm', info: MilestoneVerificationInput): void }>()
function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm', { date: props.today, verifiedBy: props.defaultVerifier, document: null }); close() }
</script>

<template>
  <MpModal id="verifymilestonemodal" :is-open="isOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>Verify milestone</MpModalHeader>
      <MpModalBody><MpText>Stub</MpText></MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">Verify milestone</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>
