<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton,
} from '@mekari/pixel3'
import type jsPDF from 'jspdf'

const props = defineProps<{
  open: boolean
  /** The built (not-yet-saved) document to preview — null while nothing's queued. */
  doc: jsPDF | null
  /** Filename used when the operator confirms Print (triggers the actual download). */
  filename: string
  title?: string
  /** Overrides the confirm button's label (default "Print") — e.g. "Print (3)" for a bulk preview. */
  printLabel?: string
}>()
const emit = defineEmits<{ close: [] }>()

// A blob URL scales to however large the doc gets (product-photo-heavy, multi-page
// docs) — a data: URI can silently fail to render in an <iframe> once it gets big.
const previewUrl = ref('')
let currentBlobUrl: string | null = null
function revokeCurrent() {
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null }
}
watch(() => props.doc, (doc) => {
  revokeCurrent()
  previewUrl.value = doc ? (currentBlobUrl = URL.createObjectURL(doc.output('blob'))) : ''
}, { immediate: true })
onUnmounted(revokeCurrent)

function confirmPrint() {
  props.doc?.save(props.filename)
  emit('close')
}
</script>

<template>
  <MpModal
    id="pdf-preview-modal" :is-open="open" size="xl"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>{{ title ?? 'Print preview' }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <iframe v-if="previewUrl" :src="previewUrl" class="pdf-preview-frame" title="PDF preview" />
      </MpModalBody>
      <MpModalFooter>
        <div class="pdf-preview-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="confirmPrint">{{ printLabel ?? 'Print' }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.pdf-preview-frame {
  display: block; width: 100%; height: 72vh; min-height: 420px;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.pdf-preview-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
