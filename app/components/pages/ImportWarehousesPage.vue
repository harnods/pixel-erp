<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '@mekari/pixel3'
import ErpDropzoneIcon from '~/components/patterns/ErpDropzoneIcon.vue'

const router = useRouter()
const { t } = useLocale()

const formatOpen = ref(false)
const uploadedFile = ref<File | null>(null)
const dragOver = ref(false)
// Errors are only set when the Import button is clicked — never on file selection
const uploadError = ref<'none' | 'no-file' | 'format' | 'size'>('none')

type ImportScenario = 'success' | 'partial' | 'error'
const importScenario = ref<ImportScenario>('success')
const fabOpen = ref(false)

const ALLOWED_EXTS = ['csv', 'xls', 'xlsx']
const MAX_BYTES = 10 * 1024 * 1024

function fileExt(f: File) { return f.name.split('.').pop()?.toLowerCase() ?? '' }

// File selection: just store the file, no error triggered here
function handleFile(file: File) {
  uploadError.value = 'none'
  uploadedFile.value = file
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file) handleFile(file)
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
  ;(e.target as HTMLInputElement).value = ''
}

function removeFile() {
  uploadedFile.value = null
  uploadError.value = 'none'
}

function goBack() { router.push('/warehouses') }

// Import button is never disabled — validation fires here on click
function doImport() {
  if (!uploadedFile.value) {
    uploadError.value = 'no-file'
    return
  }
  if (!ALLOWED_EXTS.includes(fileExt(uploadedFile.value))) {
    uploadError.value = 'format'
    return
  }
  if (uploadedFile.value.size > MAX_BYTES) {
    uploadError.value = 'size'
    return
  }
  uploadError.value = 'none'

  if (importScenario.value === 'success') {
    toast.notify({ variant: 'success', title: t('Warehouse data imported') , maxWidth: 'max-content'})
    router.push('/warehouses')
  } else if (importScenario.value === 'partial') {
    toast.notify({ variant: 'error', title: t('3 rows failed to import. Download the error file to fix.') , maxWidth: 'max-content'})
    router.push('/warehouses')
  } else {
    toast.notify({ variant: 'error', title: t('Import failed, please try again') , maxWidth: 'max-content'})
  }
}

function applyScenario(s: ImportScenario) { importScenario.value = s; fabOpen.value = false }
function applyDropzoneError(t: 'format' | 'size') { uploadedFile.value = null; uploadError.value = t; fabOpen.value = false }
function applyFileSelected() {
  const f = new File(['mock'], 'warehouses.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  Object.defineProperty(f, 'size', { value: 2_500_000 })
  uploadedFile.value = f
  uploadError.value = 'none'
  fabOpen.value = false
}

function fmtBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="iw-page">

    <!-- ── Page title bar (neutral-subtle bg, 72px, matches ErpTablePage title pattern) ── -->
    <div class="iw-titlebar">
      <div class="iw-titlebar-left">
        <button class="iw-breadcrumb" @click="goBack">{{ t('Warehouses') }}</button>
        <h1 class="iw-title">{{ t('Import warehouses') }}</h1>
      </div>
    </div>

    <!-- ── Stage (white, rounded tl/tr, scrollable) ── -->
    <div class="iw-stage">
      <div class="iw-wrapper">

        <p class="iw-intro">{{ t('Follow these steps to import your warehouse data.') }}</p>

        <div class="iw-form-group">

          <!-- ── Stepper ── -->
          <div class="iw-stepper">

            <!-- Step 1 -->
            <div class="iw-step">
              <div class="iw-step-badge-col">
                <div class="iw-step-badge">1</div>
              </div>
              <div class="iw-step-body">
                <div class="iw-step-header">
                  <p class="iw-step-title">{{ t('Download the template') }}</p>
                  <p class="iw-step-desc">{{ t('Use this template to fill in your warehouse data.') }}</p>
                  <div class="iw-spacer" />
                </div>
                <div class="iw-step-form">
                  <button class="iw-btn-download">{{ t('Download template file') }}</button>
                  <!-- Accordion: Format requirements -->
                  <div class="iw-accordion" :class="{ 'iw-accordion--open': formatOpen }">
                    <button class="iw-accordion-header" @click="formatOpen = !formatOpen">
                      <span class="iw-accordion-label">{{ t('Format requirements') }}</span>
                      <svg
                        class="iw-accordion-chevron"
                        :class="{ 'iw-accordion-chevron--open': formatOpen }"
                        width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                      >
                        <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                    <div v-if="formatOpen" class="iw-accordion-body">
                      <ul class="iw-accordion-list">
                        <li>{{ t('Date format: DD/MM/YYYY') }}</li>
                        <li>{{ t('Maximum 1.000 rows per file') }}</li>
                        <li>{{ t('Do not use thousand separators (e.g. 1000, not 1.000)') }}</li>
                        <li>{{ t('Use a period for decimals (e.g. 10.5)') }}</li>
                        <li>{{ t('Do not include currency symbols (Rp, $, etc.)') }}</li>
                        <li>{{ t('Tip: When entering numbers in spreadsheet, add a backtick (`) before the value to prevent auto-formatting. Example: `6-6003') }}</li>
                      </ul>
                      <p class="iw-accordion-help">
                        {{ t('Need help?') }} <a class="iw-accordion-help-link" href="#">{{ t('Check the import guide') }}</a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 2 -->
            <div class="iw-step">
              <div class="iw-step-badge-col">
                <div class="iw-step-badge">2</div>
              </div>
              <div class="iw-step-body">
                <div class="iw-step-header">
                  <p class="iw-step-title">{{ t('Upload your file') }}</p>
                  <p class="iw-step-desc">{{ t('Upload the completed template file to import your warehouses.') }}</p>
                  <div class="iw-spacer" />
                </div>

                <!-- Dropzone: empty state -->
                <div
                  v-if="!uploadedFile"
                  class="iw-dropzone"
                  :class="{
                    'iw-dropzone--over': dragOver,
                    'iw-dropzone--error': uploadError !== 'none',
                  }"
                  @dragover.prevent="dragOver = true"
                  @dragleave="dragOver = false"
                  @drop.prevent="onDrop"
                >
                  <ErpDropzoneIcon />
                  <div class="iw-dropzone-copy">
                    <p class="iw-dropzone-cta">
                      {{ t('Drop your file here or') }}
                      <label class="iw-dropzone-link">
                        {{ t('choose') }}
                        <input type="file" accept=".csv,.xls,.xlsx" @change="onFileInput" hidden />
                      </label>
                    </p>
                    <p class="iw-dropzone-hint">{{ t('Supported formats: CSV, XLS, XLSX.') }}</p>
                    <p class="iw-dropzone-hint">{{ t('Maximum file size 10 MB.') }}</p>
                  </div>
                  <p v-if="uploadError === 'no-file'" class="iw-dropzone-error">
                    {{ t('You must upload file') }}
                  </p>
                  <p v-if="uploadError === 'format'" class="iw-dropzone-error">
                    {{ t('File must be in CSV, XLS, or XLSX format') }}
                  </p>
                  <p v-if="uploadError === 'size'" class="iw-dropzone-error">
                    {{ t('File size must not exceed 10 MB') }}
                  </p>
                </div>

                <!-- File card: selected state -->
                <div v-else class="iw-file-card">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <div class="iw-file-info">
                    <span class="iw-file-name">{{ uploadedFile.name }}</span>
                    <span class="iw-file-size">{{ fmtBytes(uploadedFile.size) }}</span>
                  </div>
                  <button class="iw-file-remove" :aria-label="t('Remove file')" @click="removeFile">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>

              </div>
            </div>

          </div><!-- /stepper -->

          <!-- ── Action group ── -->
          <div class="iw-action-group">
            <div class="iw-action-right">
              <button class="iw-btn-cancel" @click="goBack">{{ t('Cancel') }}</button>
              <button
                class="iw-btn-import"
                @click="doImport"
              >{{ t('Import') }}</button>
            </div>
          </div>

        </div><!-- /form-group -->

      </div><!-- /wrapper -->
    </div><!-- /stage -->

    <!-- ── FAB: scenario preview ── -->
    <div class="iw-fab-wrap">
      <div v-if="fabOpen" class="iw-fab-menu">
        <div class="iw-fab-group">
          <p class="iw-fab-group-label">{{ t('Import outcome') }}</p>
          <button
            v-for="s in (['success', 'partial', 'error'] as const)"
            :key="s"
            class="iw-fab-item"
            :class="{ 'iw-fab-item--active': importScenario === s }"
            @click="applyScenario(s)"
          >{{ s === 'success' ? t('Success') : s === 'partial' ? t('Partial (3 rows failed)') : t('Import failed') }}</button>
        </div>
        <div class="iw-fab-divider" />
        <div class="iw-fab-group">
          <p class="iw-fab-group-label">{{ t('Dropzone state') }}</p>
          <button class="iw-fab-item" @click="applyFileSelected">{{ t('File selected') }}</button>
          <button class="iw-fab-item" @click="applyDropzoneError('format')">{{ t('Wrong format') }}</button>
          <button class="iw-fab-item" @click="applyDropzoneError('size')">{{ t('File too large') }}</button>
        </div>
      </div>
      <button class="iw-fab" :class="{ 'iw-fab--open': fabOpen }" :aria-label="t('Preview scenarios')" @click="fabOpen = !fabOpen">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
        </svg>
      </button>
    </div>

  </div>
</template>

<style scoped>
/* ── Page shell ── */
.iw-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Title bar (matches .page-title-bar in slug.vue) ── */
.iw-titlebar {
  flex-shrink: 0;
  height: 72px;
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}

.iw-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}

.iw-breadcrumb {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  font-family: inherit;
  white-space: nowrap;
}
.iw-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }

.iw-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage (matches .stage in slug.vue) ── */
.iw-stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

/* ── Content wrapper ── */
.iw-wrapper {
  max-width: 564px;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}

.iw-intro {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* ── Form group ── */
.iw-form-group {
  display: flex;
  flex-direction: column;
}

/* ── Stepper ── */
.iw-stepper {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-8);
}

/* ── Individual step ── */
.iw-step {
  display: flex;
  gap: var(--mp-spacing-3);
  align-items: flex-start;
}

.iw-step-badge-col {
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  align-items: flex-start;
  padding-top: 4px;
  padding-bottom: 4px;
}

.iw-step-badge {
  width: 24px;
  height: 24px;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.iw-step-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ── Step header ── */
.iw-step-header {
  display: flex;
  flex-direction: column;
}

.iw-step-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}

.iw-step-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* 12px spacer between description and form controls */
.iw-spacer {
  height: 12px;
}

/* ── Step form controls ── */
.iw-step-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: var(--mp-spacing-5);
}

/* ── Download template file button ── */
.iw-btn-download {
  align-self: flex-start;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.iw-btn-download:hover { background: var(--mp-background-neutral-hovered); }

/* ── Accordion ── */
.iw-accordion {
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md, 6px);
  overflow: hidden;
}

.iw-accordion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--mp-spacing-2);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  gap: var(--mp-spacing-3);
}
.iw-accordion-header:hover { background: var(--mp-background-neutral-hovered); }

.iw-accordion-label {
  font-size: 12px;
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 16px;
  color: var(--mp-text-default);
  text-align: left;
  flex: 1;
}

.iw-accordion-chevron {
  flex-shrink: 0;
  color: var(--mp-text-secondary);
  transition: transform 0.2s ease;
}
.iw-accordion-chevron--open { transform: rotate(90deg); }

.iw-accordion-body {
  padding: var(--mp-spacing-2);
  padding-top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
}

.iw-accordion-list {
  margin: 0;
  padding-left: 18px;
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.iw-accordion-list li {
  font-size: var(--mp-font-sizes-sm);
  line-height: 20px;
  color: var(--mp-text-secondary);
}

.iw-accordion-help {
  font-size: var(--mp-font-sizes-sm);
  line-height: 20px;
  color: var(--mp-text-secondary);
  margin: 0;
}
.iw-accordion-help-link {
  color: var(--mp-text-link);
  text-decoration: none;
}
.iw-accordion-help-link:hover { text-decoration: underline; }

/* ── Dropzone ── */
.iw-dropzone {
  background: var(--mp-background-neutral);
  border: 1px dashed var(--mp-border-default);
  border-radius: var(--mp-radii-md, 6px);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--mp-spacing-10, 40px) var(--mp-spacing-6);
  gap: var(--mp-spacing-3);
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
}
.iw-dropzone--over {
  background: var(--mp-background-neutral-subtle-hovered);
  border-color: var(--mp-text-selected);
}
.iw-dropzone--error {
  border-color: var(--mp-text-danger);
}

.iw-dropzone-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mp-text-secondary);
  flex-shrink: 0;
}

.iw-dropzone-copy {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.iw-dropzone-cta {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.iw-dropzone-link {
  color: var(--mp-text-link);
  cursor: pointer;
  font-weight: var(--mp-font-weights-semi-bold);
}

.iw-dropzone-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

.iw-dropzone-error {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-danger);
}

/* ── File card ── */
.iw-file-card {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-neutral);
  color: var(--mp-text-subtle);
}

.iw-file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.iw-file-name {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.iw-file-size {
  font-size: 12px;
  color: var(--mp-text-subtle);
}

.iw-file-remove {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mp-text-subtle);
  padding: var(--mp-spacing-1);
  display: flex;
  align-items: center;
  border-radius: 4px;
}
.iw-file-remove:hover { color: var(--mp-text-default); background: var(--mp-background-neutral-hovered); }

/* ── Action group ── */
.iw-action-group {
  display: flex;
  align-items: center;
  padding: var(--mp-spacing-4) 0;
}

.iw-action-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  margin-left: auto;
}

.iw-btn-cancel {
  background: transparent;
  border: none;
  border-radius: var(--mp-radii-full, 999px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  font-family: inherit;
}
.iw-btn-cancel:hover { background: var(--mp-background-neutral-hovered); }

.iw-btn-import {
  background: var(--mp-colors-emerald-700, #029861);
  border: 1px solid var(--mp-colors-emerald-700, #029861);
  border-radius: var(--mp-radii-full, 999px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-inverse);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.iw-btn-import:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }
.iw-btn-import:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

/* ── FAB ── */
.iw-fab-wrap {
  position: fixed;
  bottom: var(--mp-spacing-6);
  right: var(--mp-spacing-6);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--mp-spacing-2);
  z-index: 200;
}

.iw-fab-menu {
  background: var(--mp-background-stage);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md, 6px);
  box-shadow: var(--mp-shadows-md);
  padding: var(--mp-spacing-3);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  min-width: 210px;
}

.iw-fab-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.iw-fab-group-label {
  font-size: 11px;
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 var(--mp-spacing-1);
  padding: 0 var(--mp-spacing-2);
}

.iw-fab-item {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border-radius: 4px;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  font-family: inherit;
}
.iw-fab-item:hover { background: var(--mp-background-neutral-hovered); }
.iw-fab-item--active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }

.iw-fab-divider {
  height: 1px;
  background: var(--mp-border-default);
  margin: var(--mp-spacing-1) 0;
}

.iw-fab {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--mp-background-surface-bold);
  color: var(--mp-text-inverse);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--mp-shadows-md);
}
.iw-fab:hover, .iw-fab--open { opacity: 0.85; }
</style>
