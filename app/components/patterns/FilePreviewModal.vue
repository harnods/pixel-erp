<script setup lang="ts">
/**
 * FilePreviewModal — read-only preview of an already-saved file (an attachment,
 * a generated document, an uploaded image) with a Download action in the footer.
 * PDFs render in an <iframe>, images in an <img>; `kind` is auto-detected from the
 * filename extension unless passed explicitly. Distinct from PdfPreviewModal, which
 * previews a not-yet-saved jsPDF doc and confirms with Print.
 */
import { computed } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton,
} from '@mekari/pixel3'

const props = defineProps<{
  open: boolean
  /** URL / object-URL / data-URI of the file to preview. */
  src: string
  /** Filename used for the Download and shown in the header. */
  filename: string
  /** 'pdf' | 'image' — inferred from the filename extension when omitted. */
  kind?: 'pdf' | 'image'
  title?: string
}>()
const emit = defineEmits<{ close: [] }>()

const resolvedKind = computed<'pdf' | 'image'>(() =>
  props.kind ?? (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(props.filename) ? 'image' : 'pdf'),
)

function download() {
  const a = document.createElement('a')
  a.href = props.src
  a.download = props.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
</script>

<template>
  <MpModal
    id="file-preview-modal" :is-open="open" size="xl"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>{{ title ?? filename }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <iframe
          v-if="resolvedKind === 'pdf' && src" :src="src"
          class="fpm-frame" :title="`Preview of ${filename}`"
        />
        <div v-else-if="src" class="fpm-image-wrap">
          <img :src="src" :alt="`Preview of ${filename}`" class="fpm-image" />
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="fpm-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">Close</MpButton>
          <MpButton variant="primary" is-rounded left-icon="download" @click="download">Download</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.fpm-frame {
  display: block; width: 100%; height: 72vh; min-height: 420px;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.fpm-image-wrap {
  display: flex; align-items: center; justify-content: center;
  width: 100%; min-height: 320px; max-height: 72vh; padding: var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.fpm-image { max-width: 100%; max-height: 68vh; object-fit: contain; border-radius: var(--mp-radii-sm); }
.fpm-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
