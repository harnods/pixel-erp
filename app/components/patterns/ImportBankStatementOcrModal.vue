<script setup lang="ts">
/**
 * ImportBankStatementOcrModal — "Import with OCR" dropzone modal for the cash
 * management account detail page. Dummy only: file selection/removal is real,
 * but "Upload" doesn't actually scan anything — it just toasts and closes.
 */
import { MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay, MpDropzone, MpUploadList, MpTextlink, MpIcon } from '@mekari/pixel3'
import { startBankStatementReview } from '~/data'

const props = defineProps<{ open: boolean; initialFiles?: File[] }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()
const router = useRouter()

// `v-if="open"` at the call site fully unmounts/remounts this modal on every
// open, so seeding from the prop here (not a watcher) is enough to pick up
// files handed off by a page-level drag-and-drop.
const files = ref<File[]>([...(props.initialFiles ?? [])])

/** MpDropzone's `change` emits the FileList directly (not an input Event) —
 *  fires for both the file-input path and drag/drop. */
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
function handleClose() {
  emit('close')
}
/** Hand the uploaded files to the OCR review run and jump to its first file —
 *  scanning is faked, so the queue is ready immediately. */
function doUpload() {
  const run = startBankStatementReview(files.value.map((f) => f.name))
  emit('close')
  if (run.length) router.push(`/cash-management/review/${run[0]!.id}`)
}
</script>

<template>
  <MpModal
    id="cmd-import-ocr-modal" :is-open="open" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="handleClose"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Import with OCR') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="ocr-modal-body">
          <p class="ocr-modal-desc">
            {{ t('Drop bank statement files here. We will scan and create separate statements for each file automatically.') }}
          </p>

          <MpDropzone
            id="cmd-ocr-dropzone"
            class="ocr-dropzone"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.zip"
            is-multiple is-enable-input-file :is-show-preview="false"
            @change="onDropzoneFileChange"
          >
            <template #idle="{ handleClickInput }">
              <MpIcon name="upload" variant="outline" color="icon.brand" class="ocr-dropzone-icon" />
              <p class="ocr-dropzone-cta">
                {{ t('Drop your file(s) here or') }}
                <MpTextlink id="cmd-ocr-browse" as="a" @click.stop.prevent="handleClickInput">{{ t('select files') }}</MpTextlink>
              </p>
              <p class="ocr-dropzone-hint">{{ t('File can be PDF, JPG, PNG, DOC, ZIP with max size 10mb') }}</p>
            </template>
          </MpDropzone>

          <div v-if="files.length" class="ocr-files">
            <p class="ocr-files__title">{{ t('Files') }} ({{ files.length }})</p>
            <MpUploadList
              v-for="f in files" :key="f.name"
              :id="`cmd-ocr-file-${f.name}`"
              :title="f.name" status="success" :subtitle="t('Uploaded')"
              :icon-name="fileIconName(f.name)"
              is-show-remove-button
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
.ocr-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}
.ocr-modal-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* MpDropzone draws its own border/background on the inner wrapper — style that
   instead of the root, so there's only one dashed outline and no default white
   fill. Same convention as NewExpensePage.vue's receipt dropzone. */
.ocr-dropzone { cursor: pointer; }
.ocr-dropzone :deep(.mp-dropzone__wrapper) {
  border: 1px dashed var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  background: transparent;
  padding: var(--mp-sizes-10, 40px);
  gap: var(--mp-spacing-3);
  transition: border-color 0.1s, background 0.1s;
}
/* --mp-border-selected is the Enterprise-theme green used for this hover/focus
   affordance elsewhere in the app; --mp-colors-border-focused is its counterpart
   on form fields — both resolve to the same green (#41C6A0/#029861) here. */
.ocr-dropzone :deep(.mp-dropzone__wrapper:hover),
.ocr-dropzone :deep(.mp-dropzone__wrapper:focus),
.ocr-dropzone :deep(.mp-dropzone__wrapper:focus-within) {
  border-color: var(--mp-border-selected, #029861);
  background: var(--mp-background-neutral-hovered, #f8f9f9);
  outline: none;
}
.ocr-dropzone-icon { width: 32px; height: 32px; }
.ocr-dropzone-cta {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  text-align: center;
}
.ocr-dropzone-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  text-align: center;
}

.ocr-files { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ocr-files__title {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  width: 100%;
}
</style>
