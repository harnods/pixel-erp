<script setup lang="ts">
/**
 * ImportVendorInvoicesModal — "Import with OCR" dropzone modal for Purchase
 * invoices. The user drops many vendor-invoice files; on Upload they are handed
 * to the upload center (progress shows in the header activity popover) and land
 * in the Inbox. OCR runs later, on the Inbox rows — this modal only uploads.
 */
import { MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter } from '@mekari/pixel3'
import ErpDropzone from '~/components/patterns/ErpDropzone.vue'

const props = withDefaults(defineProps<{
  open: boolean
  initialFiles?: File[]
  title?: string
  description?: string
}>(), {
  title: 'Upload vendor invoices',
  description: "Drop your vendor invoice files here. We'll upload them to Dropbox and scan each one into a purchase invoice.",
})
const emit = defineEmits<{ close: []; upload: [files: File[]] }>()
const { t } = useLocale()

// The modal stays mounted (MpModal is toggled via `open`/is-open, not v-if), so
// reset the file list each time it opens — also picks up any files handed off by
// page-level drag-and-drop via initialFiles.
const files = ref<File[]>([...(props.initialFiles ?? [])])
watch(() => props.open, (isOpen) => {
  if (isOpen) files.value = [...(props.initialFiles ?? [])]
})

function onDropzoneFileChange(list: FileList | null) {
  if (!list) return
  for (const f of Array.from(list)) {
    if (!files.value.some((x) => x.name === f.name)) files.value.push(f)
  }
}
function removeFile(name: string) {
  files.value = files.value.filter((f) => f.name !== name)
}
function handleClose() { emit('close') }
function doUpload() {
  emit('upload', [...files.value])
  emit('close')
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="pi-import-ocr-modal" :is-open="open" size="md" :is-keep-alive="false" @close="handleClose"
  >
    <MpModalContent>
      <MpModalHeader>{{ t(title) }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="ocr-modal-body">
          <p class="ocr-modal-desc">{{ t(description) }}</p>

          <ErpDropzone
            id="pi-ocr-dropzone"
            :files="files"
            @change="onDropzoneFileChange"
            @remove="removeFile"
          />
        </div>
      </MpModalBody>
      <MpModalFooter v-if="files.length">
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="handleClose">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="doUpload">{{ t('Upload') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
.ocr-modal-body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.ocr-modal-desc { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
</style>
