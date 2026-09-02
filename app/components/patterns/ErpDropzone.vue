<script setup lang="ts">
/**
 * ErpDropzone — the ONE standard import dropzone for the ERP (Pixel DT 2.4
 * Enterprise). Every import/upload dropzone MUST use this so they are identical.
 * Implemented natively (not via MpDropzone) because the installed Pixel dropzone
 * doesn't render a custom idle slot — this keeps full control of the look:
 *
 *   • Idle: ErpDropzoneIcon (48px upload glyph in an 80px #F8F9F9 oval) +
 *     centred copy — "Drop your file here or **choose**", then
 *     "Supported formats: …." and "Maximum file size …." (regular).
 *   • Processing (`:processing`): the icon becomes a rotating 48px spinner in the
 *     same oval, with "Processing" below.
 *   • Done: selected files render below as removable rows (pass `:files`).
 */
import { ref } from 'vue'
import { MpUploadList, MpTextlink } from '@mekari/pixel3'
import ErpDropzoneIcon from './ErpDropzoneIcon.vue'

const props = withDefaults(defineProps<{
  id: string
  accept?: string
  /** Human list of formats, injected into "Supported formats: {formats}." */
  formats?: string
  /** Injected into "Maximum file size {maxSize}." */
  maxSize?: string
  isMultiple?: boolean
  /** True while a dropped file is processing — shows the spinner + "Processing". */
  processing?: boolean
  /** Files to list below the dropzone (each needs a `name`). */
  files?: { name: string }[]
  /** Hide the built-in file list (parent renders its own). */
  hideList?: boolean
  isInvalid?: boolean
}>(), {
  accept: '.pdf,.png,.jpg,.jpeg',
  formats: 'PDF, PNG and JPG',
  maxSize: '10 MB',
  isMultiple: true,
  processing: false,
  files: () => [],
  hideList: false,
  isInvalid: false,
})

const emit = defineEmits<{ change: [files: FileList]; remove: [name: string] }>()
const { t } = useLocale()

const inputEl = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

function openPicker() { if (!props.processing) inputEl.value?.click() }
function onInput(e: Event) {
  const t = e.target as HTMLInputElement
  if (t.files && t.files.length) emit('change', t.files)
  t.value = ''
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  if (props.processing) return
  const files = e.dataTransfer?.files
  if (files && files.length) emit('change', files)
}

function iconForFile(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'xlsx' || ext === 'csv') return 'excel-document'
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'image-document'
  return 'attachment'
}
</script>

<template>
  <div class="erp-dropzone-block">
    <div
      class="erp-dropzone"
      :class="{ 'erp-dropzone--over': dragOver, 'erp-dropzone--invalid': isInvalid, 'erp-dropzone--processing': processing }"
      role="button"
      tabindex="0"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <input
        ref="inputEl"
        :id="id"
        type="file"
        class="erp-dropzone__input"
        :accept="accept"
        :multiple="isMultiple"
        @change="onInput"
      />

      <template v-if="processing">
        <ErpDropzoneIcon loading />
        <p class="erp-dz-cta">{{ t('Processing') }}</p>
      </template>
      <template v-else>
        <ErpDropzoneIcon />
        <p class="erp-dz-cta">
          {{ t('Drop your file here or') }}
          <MpTextlink :id="`${id}-choose`" as="a" class="erp-dz-choose" @click.stop.prevent="openPicker">{{ t('choose') }}</MpTextlink>
        </p>
        <div class="erp-dz-hints">
          <p class="erp-dz-hint">{{ t('Supported formats:') }} {{ formats }}.</p>
          <p class="erp-dz-hint">{{ t('Maximum file size') }} {{ maxSize }}.</p>
        </div>
      </template>
    </div>

    <!-- Selected files — shown once processing is done; each is removable. -->
    <div v-if="!hideList && files.length" class="erp-dz-files">
      <MpUploadList
        v-for="f in files"
        :key="f.name"
        :id="`${id}-file-${f.name}`"
        :title="f.name"
        status="success"
        :subtitle="t('Ready to upload')"
        :icon-name="iconForFile(f.name)"
        is-show-remove-button
        :is-show-download-button="false"
        @remove="emit('remove', f.name)"
      />
    </div>
    <slot name="files" />
  </div>
</template>

<style scoped>
.erp-dropzone-block { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

.erp-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-3);
  text-align: center;
  /* Dashed outline drawn as an SVG stroke (not CSS `dashed`, which renders as tiny
     dots): long 8px dashes / 6px gaps, in a mid-dark gray. Border-radius matches. */
  border-radius: var(--mp-radii-md, 6px);
  background-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' fill='none'%3E%3Crect width='100%25' height='100%25' rx='6' ry='6' stroke='%239AA4AC' stroke-width='1.5' stroke-dasharray='8 6'/%3E%3C/svg%3E");
  padding: var(--mp-spacing-8) var(--mp-spacing-4);
  cursor: pointer;
  transition: background-color 0.1s;
}
.erp-dropzone:hover,
.erp-dropzone:focus,
.erp-dropzone:focus-within,
.erp-dropzone--over {
  background-color: var(--mp-background-neutral-hovered, #f8f9f9);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' fill='none'%3E%3Crect width='100%25' height='100%25' rx='6' ry='6' stroke='%23029861' stroke-width='1.5' stroke-dasharray='8 6'/%3E%3C/svg%3E");
  outline: none;
}
.erp-dropzone--invalid {
  background-color: var(--mp-background-neutral, #fff);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' fill='none'%3E%3Crect width='100%25' height='100%25' rx='6' ry='6' stroke='%23e2483d' stroke-width='1.5' stroke-dasharray='8 6'/%3E%3C/svg%3E");
}
.erp-dropzone--processing { cursor: default; }
.erp-dropzone__input { display: none; }

.erp-dz-cta {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  text-align: center;
}
/* "choose" reads as the bold action within the sentence. */
.erp-dz-choose { font-weight: var(--mp-font-weights-semi-bold, 600); }

.erp-dz-hints { display: flex; flex-direction: column; gap: 2px; }
.erp-dz-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  text-align: center;
}

.erp-dz-files { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
</style>
