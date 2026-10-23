<script setup lang="ts">
/**
 * AddFileDrawer — "Add file" from the File manager title bar (Figma 4243:42724).
 *
 * Two sections. "File information" stages the files (MpUpload + MpUploadList,
 * the same pair every upload field in the ERP uses). "Application" decides
 * where they go: onto a transaction that already exists, or alongside one the
 * user is about to create.
 *
 * Continue does the branch:
 *  - attach → the files land in the File manager already filed against that
 *    page and transaction.
 *  - create → the files land unfiled AND ride to that page's create form
 *    through `setPendingAttachments`, so the form opens with them attached.
 *    Only pages whose form has an Attachment field are offered.
 *
 * Shell is ErpDrawer (rule: never MpDrawer — it has no structural CSS here).
 */
import { MpUpload, MpUploadList, MpFormControl, MpFormLabel, MpRadio } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { attachablePages, creatablePages, filePageTarget, fileIconName } from '~/data'

export interface AddFileResult {
  files: { name: string; sizeKB: number }[]
  mode: 'attach' | 'create'
  page: string
  /** Only for mode 'attach'. */
  transactionNo: string
  contact: string
  /** Only for mode 'create' — where Continue should go. */
  newRoute: string
}

const props = withDefaults(defineProps<{
  isOpen: boolean
  /**
   * Files that already exist (bulk actions on the index). When set, the upload
   * section is hidden — there is nothing to upload, only somewhere to file them.
   */
  existingFiles?: { name: string; sizeKB: number }[]
  /** Which radio starts selected — the bulk menu picks the one it was invoked from. */
  initialMode?: 'attach' | 'create'
}>(), { existingFiles: undefined, initialMode: 'attach' })
const emit = defineEmits<{ close: []; submit: [AddFileResult] }>()

const { t } = useLocale()

/** The cap the caption promises — enforced, not just stated. */
const MAX_FILES = 5

const files = ref<{ name: string; sizeKB: number }[]>(props.existingFiles?.map(f => ({ ...f })) ?? [])
const mode = ref<'attach' | 'create'>(props.initialMode)
const attachPage = ref('')
const attachTxn = ref('')
const createPage = ref('')
const error = ref('')

// Re-arm on every open: a drawer kept in the tree would otherwise show the
// previous visit's staging.
const isExisting = computed(() => !!props.existingFiles)

watch(() => props.isOpen, (open) => {
  if (!open) return
  files.value = props.existingFiles ? props.existingFiles.map(f => ({ ...f })) : []
  mode.value = props.initialMode
  attachPage.value = ''
  attachTxn.value = ''
  createPage.value = ''
  error.value = ''
})

// The transaction list depends on the page, so changing the page invalidates
// whatever number was picked under the old one.
watch(attachPage, () => { attachTxn.value = '' })

const attachPageOptions = computed(() => attachablePages())
const createPageOptions = computed(() => creatablePages())
const txnOptions = computed(() =>
  attachPage.value ? filePageTarget(attachPage.value)?.list().map(x => x.no) ?? [] : [])

/**
 * MpUpload's @change emits the native Event (`ev.target.files`), not a
 * FileList — same signature every other upload field in the ERP handles.
 * The picker is multiple, and picking again appends rather than replaces, so
 * files can be added in several goes; the name is the dedupe key.
 */
function onFileChange(payload: Event | FileList | null) {
  const list: FileList | null | undefined =
    payload && 'target' in payload ? (payload.target as HTMLInputElement).files : (payload as FileList | null)
  if (!list?.length) return
  let added = 0
  for (const f of Array.from(list)) {
    if (files.value.some(x => x.name === f.name)) continue
    if (files.value.length >= MAX_FILES) {
      error.value = t('You can upload up to 5 files at a time.')
      break
    }
    files.value.push({ name: f.name, sizeKB: Math.max(1, Math.round(f.size / 1024)) })
    added++
  }
  // Staging a file answers the "choose a file" error, but not the cap one.
  if (added && files.value.length < MAX_FILES) error.value = ''
  // Clear the input so re-picking the same file still fires a change.
  if (payload && 'target' in payload) (payload.target as HTMLInputElement).value = ''
}
/**
 * MpUploadList renders its own (-) button and exposes no way to label it, so
 * the hover hint goes on after mount. A native title, not Pixel's v-tooltip:
 * the directive has to be bound to the element in the template, and this
 * button lives inside the component.
 */
function labelRemove(el: unknown) {
  const root = (el as { $el?: HTMLElement } | null)?.$el
  const btn = root?.querySelector?.('button:last-of-type')
  if (btn && !btn.getAttribute('title')) btn.setAttribute('title', t('Remove'))
}

function removeFile(name: string) {
  files.value = files.value.filter(f => f.name !== name)
}

// Errors stay inline and the button stays enabled — rule/no-disabled-buttons.
function submit() {
  if (!files.value.length) { error.value = t('Choose at least one file to upload.'); return }
  if (mode.value === 'attach') {
    if (!attachPage.value) { error.value = t('Select the page this file belongs to.'); return }
    if (!attachTxn.value) { error.value = t('Select the transaction this file belongs to.'); return }
    const contact = filePageTarget(attachPage.value)?.list().find(x => x.no === attachTxn.value)?.contact ?? ''
    emit('submit', {
      files: files.value.map(f => ({ ...f })),
      mode: 'attach', page: attachPage.value, transactionNo: attachTxn.value, contact, newRoute: '',
    })
    return
  }
  if (!createPage.value) { error.value = t('Select the transaction you want to create.'); return }
  emit('submit', {
    files: files.value.map(f => ({ ...f })),
    mode: 'create', page: createPage.value, transactionNo: '', contact: '',
    newRoute: filePageTarget(createPage.value)?.newRoute ?? '',
  })
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="isExisting ? t('Attach files') : t('Add file')" width="480px" @close="emit('close')">
    <template #body>
      <section class="afd-section">
        <h3 v-if="!isExisting" class="afd-section-title">{{ t('File information') }}</h3>

        <MpFormControl v-if="!isExisting" id="afd-upload">
          <MpFormLabel>{{ t('Upload file') }}</MpFormLabel>
          <MpUpload
            id="afd-upload-field"
            accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
            is-multiple is-full-width
            :placeholder="t('or drag and drop here')"
            :button-text="t('Browse file')"
            @change="onFileChange"
          />
          <p class="afd-caption">
            {{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction') }}
          </p>
        </MpFormControl>

        <!-- The staged (or, in bulk, the selected) files, right under the
             field that produced them. -->
        <h3 v-if="isExisting" class="afd-section-title">
          {{ files.length }} {{ files.length === 1 ? t('file') : t('files') }} {{ t('selected') }}
        </h3>
        <div v-if="files.length" class="afd-file-list">
          <MpUploadList
            v-for="f in files" :key="f.name"
            :ref="labelRemove"
            :id="`afd-file-${f.name}`"
            :title="f.name"
            :subtitle="f.sizeKB ? `${f.sizeKB} KB` : undefined"
            status="success"
            :icon-name="fileIconName(f.name)"
            :is-show-download-button="false"
            :is-show-remove-button="!isExisting"
            @remove="removeFile(f.name)"
          />
        </div>
      </section>

      <section class="afd-section">
        <h3 class="afd-section-title">{{ t('Application') }}</h3>

        <label class="afd-radio-row">
          <MpRadio
            name="afd-mode" value="attach"
            :is-checked="mode === 'attach'"
            @change="mode = 'attach'; error = ''"
          />
          <span class="afd-radio-label">{{ t('Attach to an existing transaction') }}</span>
        </label>

        <div v-if="mode === 'attach'" class="afd-radio-body">
          <MpFormControl id="afd-attach-page">
            <MpFormLabel>{{ t('Page') }}</MpFormLabel>
            <ErpFilterSelect
              id="afd-attach-page-select"
              v-model="attachPage"
              :options="attachPageOptions"
              :placeholder="t('Select page')"
              width="100%"
              :is-clearable="false"
            />
          </MpFormControl>
          <ErpFilterSelect
            id="afd-attach-txn-select"
            v-model="attachTxn"
            :options="txnOptions"
            :placeholder="attachPage ? t('Select transaction') : t('Select a page first')"
            width="100%"
            :is-clearable="false"
          />
        </div>

        <label class="afd-radio-row">
          <MpRadio
            name="afd-mode" value="create"
            :is-checked="mode === 'create'"
            @change="mode = 'create'; error = ''"
          />
          <span class="afd-radio-label">{{ t('Create a new transaction') }}</span>
        </label>

        <div v-if="mode === 'create'" class="afd-radio-body">
          <MpFormControl id="afd-create-page">
            <MpFormLabel>{{ t('Page') }}</MpFormLabel>
            <ErpFilterSelect
              id="afd-create-page-select"
              v-model="createPage"
              :options="createPageOptions"
              :placeholder="t('Select page')"
              width="100%"
              :is-clearable="false"
            />
          </MpFormControl>
          <p class="afd-caption">{{ t('The file is attached to the form when it opens.') }}</p>
        </div>

        <p v-if="error" class="afd-error">{{ error }}</p>
      </section>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" @click="emit('close')">{{ t('Cancel') }}</MpButton>
      <MpButton class="btn-enterprise btn-enterprise--primary" @click="submit">{{ t('Continue') }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.afd-section {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3, 12px);
}
.afd-section + .afd-section {
  margin-top: var(--mp-spacing-6, 24px);
}
.afd-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 24px);
  color: var(--mp-text-default);
}
.afd-caption {
  margin: 0;
  font-size: var(--mp-font-sizes-sm, 12px);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-subtle);
}
/* The rows read as one list, so they sit flush — the section's 12px gap would
   push them apart. Each row keeps 4px of its own breathing room instead of
   Pixel's default 8px. */
.afd-file-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.afd-file-list :deep([data-pixel-component='MpUploadList']) {
  padding-top: var(--mp-spacing-1, 4px);
  padding-bottom: var(--mp-spacing-1, 4px);
}

.afd-radio-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  cursor: pointer;
  user-select: none;
}
.afd-radio-label {
  font-size: var(--mp-font-sizes-md, 14px);
  color: var(--mp-text-default);
}
/* Indented under its radio, matching the Figma's nested Feature/number pair. */
.afd-radio-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2, 8px);
  padding-left: var(--mp-spacing-8, 32px);
}
.afd-error {
  margin: 0;
  font-size: var(--mp-font-sizes-md, 14px);
  color: var(--mp-text-danger, #c41929);
}
</style>
