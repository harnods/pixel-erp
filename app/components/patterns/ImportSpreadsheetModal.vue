<script setup lang="ts">
/**
 * ImportSpreadsheetModal — the shared "Import from spreadsheet" dropzone modal.
 * Reached from an index page's Import ▸ "Import from spreadsheet" menu item. The
 * user downloads the template, fills it, and drops the .xlsx/.csv back here; on
 * Upload the file is handed off (prototype: emitted to the caller). Follows
 * rule/import-modal (MpModal md + description + shared ErpDropzone + Cancel/Upload
 * footer shown once a file is staged).
 */
import { MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpTextlink } from '@mekari/pixel3'
import ErpDropzone from '~/components/patterns/ErpDropzone.vue'

const props = withDefaults(defineProps<{
  open: boolean
  /** Noun for the copy, e.g. "sales invoices". */
  entityLabel?: string
  title?: string
}>(), {
  entityLabel: 'records',
  title: 'Import from spreadsheet',
})
const emit = defineEmits<{ close: []; upload: [files: File[]] }>()
const { t } = useLocale()

const files = ref<File[]>([])
watch(() => props.open, (isOpen) => { if (isOpen) files.value = [] })

function onDropzoneFileChange(list: FileList | null) {
  if (!list) return
  for (const f of Array.from(list)) {
    if (!files.value.some((x) => x.name === f.name)) files.value.push(f)
  }
}
function removeFile(name: string) { files.value = files.value.filter((f) => f.name !== name) }
function handleClose() { emit('close') }
function doUpload() {
  emit('upload', [...files.value])
  emit('close')
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="import-spreadsheet-modal" :is-open="open" size="md" :is-keep-alive="false" @close="handleClose"
  >
    <MpModalContent>
      <MpModalHeader>{{ t(title) }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="ism-body">
          <p class="ism-desc">
            {{ t('Download the template, fill in your') }} {{ t(entityLabel) }},
            {{ t('then upload the completed file below.') }}
            <MpTextlink id="ism-template" as="a" @click.prevent>{{ t('Download template') }}</MpTextlink>
          </p>

          <ErpDropzone
            id="import-spreadsheet-dropzone"
            :files="files"
            accept=".xlsx,.csv"
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
.ism-body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.ism-desc { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
</style>
