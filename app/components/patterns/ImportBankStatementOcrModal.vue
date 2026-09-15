<script setup lang="ts">
/**
 * ImportBankStatementOcrModal — "Import with OCR" dropzone modal for the cash
 * management account detail page. Dummy only: file selection/removal is real,
 * but "Upload" doesn't actually scan anything — it just toasts and closes.
 */
import { MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay } from '@mekari/pixel3'
import ErpDropzone from '~/components/patterns/ErpDropzone.vue'
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
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="cmd-import-ocr-modal" :is-open="open" size="md" :is-keep-alive="false" @close="handleClose"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Import with OCR') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="ocr-modal-body">
          <p class="ocr-modal-desc">
            {{ t('Drop bank statement files here. We will scan and create separate statements for each file automatically.') }}
          </p>

          <ErpDropzone
            id="cmd-ocr-dropzone"
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

.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  width: 100%;
}
</style>
