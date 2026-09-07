<script setup lang="ts">
import { ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ImportVendorInvoicesModal from '~/components/patterns/ImportVendorInvoicesModal.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Import modal · Pixel 3 Enterprise' })

// Seed a couple of mock files so the file list + footer render in the demo
// (client-only — `File` doesn't exist during SSR).
const seeded = ref<File[]>([])
if (import.meta.client) {
  seeded.value = [
    new File([''], 'vendor-invoice-jan.pdf', { type: 'application/pdf' }),
    new File([''], 'vendor-invoice-feb.pdf', { type: 'application/pdf' }),
  ]
}

const open = ref(false)
const lastUploaded = ref(0)
function onUpload(files: File[]) { lastUploaded.value = files.length }
</script>

<template>
  <div>
    <DemoHeader title="Import modal" tag="pattern · import"
      lead="The file-drop import modal — same shell everywhere you bring files in (Purchase invoice import, Expenses / bank-statement OCR …). MpModal (size md) + the shared ErpDropzone + a Cancel / Upload footer that only appears once at least one file is staged. It only UPLOADS; downstream processing (OCR, matching) happens later on the resulting rows. NOTE: a spreadsheet import with a downloadable template is a stepped PAGE (ImportWarehousesPage), not this modal."
      :rules="['rule/import-modal', 'rule/import-modal-dropzone', 'rule/modal-use-mpmodal']" />

    <DemoSection title="Open it"
      desc="A title + one-line description of what's being imported, then the dropzone. The footer (Cancel + Upload) is hidden until a file is staged — nothing to upload, nothing to confirm. Reuse ImportVendorInvoicesModal (generic: pass title / description / initialFiles); don't hand-roll a new import modal."
      :rules="['rule/import-modal']"
      code="<MpButton variant=&quot;secondary&quot; is-rounded @click=&quot;open = true&quot;>Import</MpButton>

<ImportVendorInvoicesModal
  :open=&quot;open&quot;
  title=&quot;Upload vendor invoices&quot;
  description=&quot;Drop your files here…&quot;
  @close=&quot;open = false&quot; @upload=&quot;onUpload&quot; />">
      <div class="im-row">
        <MpButton variant="secondary" is-rounded @click="open = true">Import</MpButton>
        <span class="im-hint">{{ lastUploaded ? `${lastUploaded} file(s) uploaded` : 'Opens with 2 sample files staged' }}</span>
      </div>
    </DemoSection>

    <DemoSection title="Dropzone + staged files"
      desc="The body is the shared ErpDropzone: a dashed drop area ('Drag & drop or browse', accepted types + max size), and below it each staged file as a removable row. Drag-drop or click-to-browse both add files; duplicates (same name) are ignored. Reuse ErpDropzone — never build a bespoke file input."
      :rules="['rule/import-modal-dropzone']"
      code="<ErpDropzone :files=&quot;files&quot; accept=&quot;.pdf,.png,.jpg&quot; max-size=&quot;10 MB&quot;
  @change=&quot;onDropzoneFileChange&quot; @remove=&quot;removeFile&quot; />" >
      <p class="im-note">Open the modal — it starts with two sample files so you can see the list + footer.</p>
    </DemoSection>

    <DemoSection title="Footer — Cancel · Upload"
      desc="Ghost Cancel + primary Upload, pinned right, shown only when files are staged. Upload hands the files off and closes; Cancel / × discards. Progress is surfaced elsewhere (the header upload-center), not blocking in the modal."
      :rules="['rule/btn-cancel-ghost', 'rule/btn-one-primary']"
      code="<MpModalFooter v-if=&quot;files.length&quot;>
  <button class=&quot;btn-enterprise btn-enterprise--ghost&quot;>Cancel</button>
  <button class=&quot;btn-enterprise btn-enterprise--primary&quot;>Upload</button>
</MpModalFooter>" >
      <p class="im-note">The footer sits at the bottom of the open modal.</p>
    </DemoSection>

    <ImportVendorInvoicesModal
      :open="open" :initial-files="seeded"
      title="Upload vendor invoices"
      description="Drop your vendor invoice files here. We'll upload them and scan each one into a purchase invoice."
      @close="open = false" @upload="onUpload"
    />
  </div>
</template>

<style scoped>
.im-row { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.im-hint, .im-note { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.im-note { margin: 0; }
</style>
