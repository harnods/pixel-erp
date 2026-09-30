<script setup lang="ts">
import { ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import FilePreviewModal from '~/components/patterns/FilePreviewModal.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'PDF preview modal · Pixel 3 Enterprise' })

// A tiny valid sample PDF → blob URL (client-only; blob renders more reliably than
// a data: URI inside an <iframe>).
const PDF_B64 = 'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNDIwIDI2MF0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggMTIwPj5zdHJlYW0KQlQgL0YxIDIyIFRmIDQwIDIwMCBUZCAoU2FtcGxlIGludm9pY2UgUERGKSBUaiBFVApCVCAvRjEgMTMgVGYgNDAgMTY1IFRkIChQcmV2aWV3IHJlbmRlcmVkIGluIGFuIGlmcmFtZS4pIFRqIEVUCmVuZHN0cmVhbSBlbmRvYmoKNSAwIG9iajw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4='
const pdfUrl = ref('')
if (import.meta.client) {
  const bytes = Uint8Array.from(atob(PDF_B64), (c) => c.charCodeAt(0))
  pdfUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

const open = ref(false)
</script>

<template>
  <div>
    <DemoHeader title="PDF preview modal" tag="pattern · file preview"
      lead="Read-only preview of an already-saved PDF (an attachment, a generated invoice/PO, an uploaded document) with a Download action in the footer. One shared component — FilePreviewModal.vue (MpModal size xl) — renders the PDF in an <iframe> and offers Close + Download. Distinct from PdfPreviewModal, which previews a not-yet-saved jsPDF doc and confirms with Print."
      :rules="['rule/file-preview-modal', 'rule/file-preview-download', 'rule/modal-use-mpmodal']" />

    <DemoSection title="Open it"
      desc="Header = the filename (or a title). Body = the PDF in a full-width iframe (72vh, bordered). Footer = ghost Close + primary Download. kind is auto-detected from the filename extension — .pdf → iframe."
      :rules="['rule/file-preview-modal']"
      code="<MpButton variant=&quot;secondary&quot; is-rounded @click=&quot;open = true&quot;>Preview</MpButton>

<FilePreviewModal
  :open=&quot;open&quot; :src=&quot;pdfUrl&quot; filename=&quot;invoice-00042.pdf&quot;
  @close=&quot;open = false&quot; />">
      <div class="pv-row">
        <MpButton variant="secondary" is-rounded @click="open = true">Preview PDF</MpButton>
        <span class="pv-hint">Opens invoice-00042.pdf in an iframe</span>
      </div>
    </DemoSection>

    <DemoSection title="Footer — Close · Download"
      desc="Ghost Close + primary Download, pinned right. Download saves the file under its filename via a temporary anchor; Close / × dismisses. It's a preview, not an editor — no other actions."
      :rules="['rule/file-preview-download', 'rule/btn-cancel-ghost', 'rule/btn-one-primary']"
      code="<MpModalFooter>
  <MpButton variant=&quot;ghost&quot; is-rounded>Close</MpButton>
  <MpButton variant=&quot;primary&quot; is-rounded>Download</MpButton>
</MpModalFooter>" >
      <p class="pv-note">The footer sits at the bottom of the open modal.</p>
    </DemoSection>

    <FilePreviewModal :open="open" :src="pdfUrl" filename="invoice-00042.pdf" @close="open = false" />
  </div>
</template>

<style scoped>
.pv-row { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.pv-hint, .pv-note { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pv-note { margin: 0; }
</style>
