<script setup lang="ts">
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpButton,
} from '@mekari/pixel3'

defineProps<{
  isOpen: boolean
  /** Omit the "Save as draft" option — the form has no draft concept. */
  hasSaveDraft: boolean
}>()
const emit = defineEmits<{ leave: []; draft: []; cancel: [] }>()
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="unsaved-changes-dialog"
    :is-open="isOpen"
    size="md"
    @close="emit('cancel')"
  >
    <MpModalContent>
      <MpModalHeader>
        Leave without saving?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="ucm-dialog-body">You have unsaved changes that will be lost if you leave this page.</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="ucm-footer">
          <MpButton class="btn-enterprise btn-enterprise--ghost" @click="emit('cancel')">Cancel</MpButton>
          <MpButton
            class="btn-enterprise"
            :class="hasSaveDraft ? 'btn-enterprise--secondary' : 'btn-enterprise--danger'"
            @click="emit('leave')"
          >Leave without saving</MpButton>
          <MpButton v-if="hasSaveDraft" class="btn-enterprise btn-enterprise--primary" @click="emit('draft')">Save as draft</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.ucm-dialog-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ucm-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
