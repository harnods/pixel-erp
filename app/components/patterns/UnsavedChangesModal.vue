<script setup lang="ts">
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'

defineProps<{
  isOpen: boolean
  /** Omit the "Save as draft" option — the form has no draft concept. */
  hasSaveDraft: boolean
}>()
const emit = defineEmits<{ leave: []; draft: []; cancel: [] }>()
</script>

<template>
  <MpModal
    id="unsaved-changes-dialog"
    :is-open="isOpen"
    size="md"
    is-close-on-esc
    is-close-on-overlay-click
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
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('cancel')">Cancel</button>
          <button
            class="btn-enterprise"
            :class="hasSaveDraft ? 'btn-enterprise--secondary' : 'btn-enterprise--danger'"
            type="button"
            @click="emit('leave')"
          >Leave without saving</button>
          <button v-if="hasSaveDraft" class="btn-enterprise btn-enterprise--primary" type="button" @click="emit('draft')">Save as draft</button>
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
