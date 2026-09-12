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
  /** Filename used as a fallback when the browser print path is unavailable. */
  filename: string
  title?: string
  /** Overrides the confirm button's label (default "Print PDF") — e.g. "Print PDF (3)" for a bulk preview. */
  printLabel?: string
}>()
const emit = defineEmits<{ close: []; 'open-template-settings': [] }>()

// A blob URL scales to however large the doc gets (product-photo-heavy, multi-page
// docs) — a data: URI can silently fail to render in an <iframe> once it gets big.
const previewUrl = ref('')
const frameEl = ref<HTMLIFrameElement | null>(null)
let currentBlobUrl: string | null = null
function revokeCurrent() {
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null }
}
watch(() => props.doc, (doc) => {
  revokeCurrent()
  previewUrl.value = doc ? (currentBlobUrl = URL.createObjectURL(doc.output('blob'))) : ''
}, { immediate: true })
onUnmounted(revokeCurrent)

// Print (not download): drive the browser print dialog off the preview iframe;
// fall back to the jsPDF print path if the frame isn't reachable.
function confirmPrint() {
  const win = frameEl.value?.contentWindow
  if (win) {
    win.focus()
    win.print()
  } else {
    props.doc?.autoPrint?.()
    props.doc?.output('dataurlnewwindow')
  }
  emit('close')
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="pdf-preview-modal" :is-open="open" size="xl" :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>{{ title ?? 'Print preview' }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <!-- Single-column PDF preview — no thumbnail rail (rule/pdf-preview-modal). -->
        <iframe v-if="previewUrl" ref="frameEl" :src="previewUrl" class="pdf-preview-frame" title="PDF preview" />
      </MpModalBody>
      <MpModalFooter>
        <div class="pdf-preview-footer">
          <MpButton variant="secondary" is-rounded @click="emit('open-template-settings')">Open template settings</MpButton>
          <MpButton variant="primary" is-rounded @click="confirmPrint">{{ printLabel ?? 'Print PDF' }}</MpButton>
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
/* Template settings sits left, Print PDF right (rule/pdf-preview-modal). */
.pdf-preview-footer { display: flex; justify-content: space-between; align-items: center; gap: var(--mp-spacing-2); width: 100%; }
</style>
