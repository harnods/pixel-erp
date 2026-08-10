<script setup lang="ts">
/**
 * GlobalFileDropOverlay — full-viewport "drop your files here" overlay shown
 * while the user drags OS files anywhere over the page (Figma node 4739:102623).
 * Purely presentational + event plumbing: listens on `window` (not a local
 * drop target) so it fires no matter what element the file is dragged over,
 * and hands the dropped FileList back to the parent via `@drop` — the parent
 * decides what an upload actually means for that page.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { MpIcon } from '@mekari/pixel3'

const emit = defineEmits<{ drop: [files: FileList] }>()
const { t } = useLocale()

const isDragging = ref(false)
// dragenter/dragleave fire per element crossed, not once for the window — a
// depth counter is the standard way to tell "left a child" from "left the window".
let depth = 0

function hasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}
function onDragEnter(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  depth++
  isDragging.value = true
}
function onDragOver(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
}
function onDragLeave(e: DragEvent) {
  if (!hasFiles(e)) return
  depth = Math.max(0, depth - 1)
  if (depth === 0) isDragging.value = false
}
function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  depth = 0
  isDragging.value = false
  if (e.dataTransfer?.files?.length) emit('drop', e.dataTransfer.files)
}
// Dragging out of the browser window entirely (e.g. dropping on the desktop)
// doesn't reliably fire dragleave for every element that got a dragenter.
function onWindowBlur() {
  depth = 0
  isDragging.value = false
}

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
  window.addEventListener('blur', onWindowBlur)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
  window.removeEventListener('blur', onWindowBlur)
})
</script>

<template>
  <div v-if="isDragging" class="gfd-overlay">
    <div class="gfd-content">
      <MpIcon name="doc" variant="outline" color="icon.inverse" class="gfd-icon" />
      <div class="gfd-text">
        <p class="gfd-title">{{ t('Drag & drop your file(s) here') }}</p>
        <p class="gfd-desc">{{ t('File can be PDF, JPG, PNG, DOC, ZIP') }}<br>{{ t('with max size of 10MB') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* pointer-events:none — this layer is pure feedback; the window-level
   listeners above are what actually track the drag, not this element, so it
   never needs to be a hit target itself. */
.gfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mp-colors-background-overlay, #232933cc);
  pointer-events: none;
}
.gfd-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-6, 24px);
}
.gfd-icon { width: 80px; height: 80px; }
.gfd-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-1, 4px);
  text-align: center;
  color: var(--mp-text-inverse, #fff);
}
.gfd-title {
  margin: 0;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md, 20px);
}
.gfd-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md, 20px);
}
</style>
