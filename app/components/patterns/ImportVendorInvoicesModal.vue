<script setup lang="ts">
/**
 * ImportVendorInvoicesModal — "Import with OCR" dropzone modal for Purchase
 * invoices. The user drops many vendor-invoice files; on Upload they are handed
 * to the upload center (progress shows in the header activity popover) and land
 * in the Inbox. OCR runs later, on the Inbox rows — this modal only uploads.
 */
import { MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay, MpDropzone, MpUploadList } from '@mekari/pixel3'

const props = defineProps<{ open: boolean; initialFiles?: File[] }>()
const emit = defineEmits<{ close: []; upload: [names: string[]] }>()
const { t } = useLocale()

// `v-if="open"` at the call site remounts on every open, so seeding from the
// prop (not a watcher) picks up files handed off by page-level drag-and-drop.
const files = ref<File[]>([...(props.initialFiles ?? [])])

function onDropzoneFileChange(list: FileList | null) {
  if (!list) return
  for (const f of Array.from(list)) {
    if (!files.value.some((x) => x.name === f.name)) files.value.push(f)
  }
}
function removeFile(name: string) {
  files.value = files.value.filter((f) => f.name !== name)
}
function fileIconName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'doc' || ext === 'docx') return 'word-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  if (ext === 'zip') return 'zip'
  return 'doc'
}
function handleClose() { emit('close') }
function doUpload() {
  emit('upload', files.value.map((f) => f.name))
  emit('close')
}
</script>

<template>
  <MpModal
    id="pi-import-ocr-modal" :is-open="open" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="handleClose"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Upload vendor invoices') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="ocr-modal-body">
          <p class="ocr-modal-desc">
            {{ t('Drop your vendor invoice files here. We\'ll upload them to Dropbox and scan each one into a purchase invoice.') }}
          </p>

          <MpDropzone
            id="pi-ocr-dropzone"
            class="ocr-dropzone"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.zip"
            is-multiple is-enable-input-file :is-show-preview="false"
            :placeholder="t('Drop your file(s) here or')"
            :button-text="t('select files')"
            :description="t('File can be PDF, JPG, PNG, DOC, ZIP with max size 10mb')"
            @change="onDropzoneFileChange"
          />

          <div v-if="files.length" class="ocr-files">
            <p class="ocr-files__title">{{ t('Files') }} ({{ files.length }})</p>
            <MpUploadList
              v-for="f in files" :key="f.name"
              :id="`pi-ocr-file-${f.name}`"
              :title="f.name" status="success" :subtitle="t('Ready to upload')"
              :icon-name="fileIconName(f.name)"
              is-show-remove-button :is-show-download-button="false"
              @remove="removeFile(f.name)"
            />
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter v-if="files.length">
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="handleClose">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="doUpload">{{ t('Upload') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.ocr-modal-body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.ocr-modal-desc { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }

.ocr-dropzone { cursor: pointer; }
.ocr-dropzone :deep(.mp-dropzone__wrapper) {
  border: 1px dashed var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  background: transparent;
  padding: var(--mp-sizes-10, 40px);
  gap: var(--mp-spacing-3);
  transition: border-color 0.1s, background 0.1s;
}
.ocr-dropzone :deep(.mp-dropzone__wrapper:hover),
.ocr-dropzone :deep(.mp-dropzone__wrapper:focus),
.ocr-dropzone :deep(.mp-dropzone__wrapper:focus-within) {
  border-color: var(--mp-border-selected, #029861);
  background: var(--mp-background-neutral-hovered, #f8f9f9);
  outline: none;
}
.ocr-dropzone-icon { width: 32px; height: 32px; }
.ocr-dropzone-cta { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); text-align: center; }
.ocr-dropzone-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: center; }

.ocr-files { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ocr-files__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
</style>
