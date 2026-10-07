<script setup lang="ts">
/**
 * Import per-warehouse replenishment settings (PRD US-021 AC-02, US-008 EH-01).
 *
 * One sheet sets safety days, reorder point and preferred vendor for many product ×
 * warehouse pairs at once. Same shape as the vendor-terms import: it PREVIEWS before it
 * commits, writes the valid rows and hands the rejected ones back with the row number and
 * the reason (partial commit, so one typo never blocks the rest). The file is really read
 * and validated here — download the template, change a value, upload it back.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { MpBanner, MpBannerIcon, MpBannerDescription, MpButton, MpButtonGroup, MpIcon, MpTextlink } from '@mekari/pixel3'
import ErpDropzone from '~/components/patterns/ErpDropzone.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import {
  settingsTemplate, hasSettingsColumns, validateSettingsImport, applySettingsImport,
  SETTINGS_IMPORT_ROW_LIMIT, type SettingsImportRow,
} from '~/data/replenishmentSettingsImport'
import { parseCsv, downloadCsv } from '~/utils/csv'
import { successToast } from '~/utils/toasts'

const router = useRouter()
const { t, tf } = useLocale()

const MAX_MB = 10
type Stage = 'upload' | 'preview' | 'done'
const stage = ref<Stage>('upload')
const file = ref<File | null>(null)
const formatOpen = ref(false)
const uploadError = ref('')
const importError = ref('')
const rows = ref<SettingsImportRow[]>([])
const written = ref(0)

const toUpdate = computed(() => rows.value.filter((r) => r.outcome === 'update'))
const unchanged = computed(() => rows.value.filter((r) => r.outcome === 'unchanged'))
const rejected = computed(() => rows.value.filter((r) => r.outcome === 'rejected'))

/** The table needs one record per row with plain keys it can sort and render. */
type PreviewRow = SettingsImportRow & Record<string, unknown>
const previewRows = computed(() => rows.value as PreviewRow[])

const columns = computed<TableColumn[]>(() => [
  { key: 'rowNumber', label: t('Row'), kind: 'unit' },
  { key: 'productName', label: t('Product'), kind: 'name' },
  { key: 'sku', label: t('Product code'), kind: 'number' },
  { key: 'warehouseName', label: t('Warehouse'), kind: 'name' },
  { key: 'safetyDays', label: t('Safety days'), align: 'right' },
  { key: 'reorderPoint', label: t('Reorder point'), align: 'right' },
  { key: 'vendorName', label: t('Preferred vendor'), kind: 'name' },
  { key: 'outcome', label: t('Status'), kind: 'address' },
])

function goBack(): void { router.push('/replenishment') }

function downloadTemplate(): void { downloadCsv(settingsTemplate(), 'replenishment-settings-template.csv') }

function onFileChange(list: FileList): void {
  const f = list[0]
  if (!f) return
  uploadError.value = ''
  if (f.size > MAX_MB * 1024 * 1024) { uploadError.value = t('File size exceeds the 10 MB limit'); return }
  if (!/\.csv$/i.test(f.name)) { uploadError.value = t('File format not supported. Upload a CSV file'); return }
  file.value = f
}
function removeFile(): void { file.value = null; uploadError.value = '' }

/** Step 2 → preview. Always clickable; a missing precondition is an inline error. */
async function reviewFile(): Promise<void> {
  if (!file.value) { uploadError.value = t('You must upload a file'); return }
  const sheet = parseCsv(await file.value.text())
  if (!sheet.length || !hasSettingsColumns(sheet[0]!)) {
    uploadError.value = t('File structure is incorrect. Use the provided template without modifying the columns')
    return
  }
  if (sheet.length - 1 > SETTINGS_IMPORT_ROW_LIMIT) {
    uploadError.value = tf('The file has more than {n} rows', { n: SETTINGS_IMPORT_ROW_LIMIT.toLocaleString('id-ID') })
    return
  }
  uploadError.value = ''
  importError.value = ''
  rows.value = validateSettingsImport(sheet)
  stage.value = 'preview'
}

/** Commit: valid rows are written, rejected rows are left untouched. */
function commitImport(): void {
  if (!toUpdate.value.length) { importError.value = t('No rows in this file change anything'); return }
  written.value = applySettingsImport(rows.value)
  stage.value = 'done'
  successToast(t('Replenishment settings imported'))
}

function downloadErrorReport(): void {
  downloadCsv(
    [[t('Row'), t('Product code'), t('Warehouse'), t('Reason')],
      ...rejected.value.map((r) => [r.rowNumber, r.sku, r.warehouseName, t(r.error)])],
    'replenishment-settings-errors.csv',
  )
}
</script>

<template>
  <div class="irs-page">
    <div class="irs-titlebar">
      <div class="irs-titlebar-left">
        <MpTextlink id="irs-breadcrumb" as="a" class="irs-breadcrumb" @click.prevent="goBack">{{ t('Replenishment') }}</MpTextlink>
        <h1 class="irs-title" data-devchange="replenishment-settings-import">{{ t('Import replenishment settings') }}</h1>
      </div>
    </div>

    <div class="irs-stage">
      <div class="irs-wrapper">

        <!-- ─────────── Upload ─────────── -->
        <template v-if="stage === 'upload'">
          <p class="irs-intro">
            {{ t('Set safety days, reorder point and preferred vendor for many products and warehouses from one spreadsheet.') }}
          </p>

          <div class="irs-stepper">
            <section class="irs-step">
              <div class="irs-step-badge">1</div>
              <div class="irs-step-body">
                <h2 class="irs-step-title">{{ t('Download the template') }}</h2>
                <p class="irs-step-desc">{{ t('The template lists every product in every warehouse with the values in force today, so you only change what should move.') }}</p>
                <MpButton id="irs-download-template" variant="secondary" is-rounded @click="downloadTemplate">{{ t('Download template file') }}</MpButton>

                <div class="irs-accordion">
                  <MpButton id="irs-format-toggle" variant="ghost" class="irs-accordion-head" @click="formatOpen = !formatOpen">
                    <span>{{ t('Format requirements') }}</span>
                    <MpIcon :name="formatOpen ? 'arrows-up' : 'arrows-down'" size="sm" />
                  </MpButton>
                  <ul v-if="formatOpen" class="irs-accordion-list">
                    <li>{{ t('Maximum') }} {{ SETTINGS_IMPORT_ROW_LIMIT.toLocaleString('id-ID') }} {{ t('rows per file') }}</li>
                    <li>{{ t('Safety days must be a whole number of 1 or more; reorder point a whole number of 0 or more') }}</li>
                    <li>{{ t('Leave a cell empty to keep what is in force') }}</li>
                    <li>{{ t('The preferred vendor must already be listed for the product') }}</li>
                    <li>{{ t('Do not change or reorder the template columns') }}</li>
                  </ul>
                </div>
              </div>
            </section>

            <section class="irs-step">
              <div class="irs-step-badge">2</div>
              <div class="irs-step-body">
                <h2 class="irs-step-title">{{ t('Upload your file') }}</h2>
                <p class="irs-step-desc">{{ t('You will see exactly what will change before anything is saved.') }}</p>
                <ErpDropzone
                  id="irs-dropzone"
                  accept=".csv"
                  formats="CSV"
                  :max-size="`${MAX_MB} MB`"
                  :files="file ? [{ name: file.name }] : []"
                  :is-invalid="!!uploadError"
                  @change="onFileChange"
                  @remove="removeFile"
                />
                <p v-if="uploadError" class="irs-error">{{ uploadError }}</p>
              </div>
            </section>
          </div>

          <footer class="irs-footer">
            <MpButtonGroup class="erp-action-footer">
              <MpButton id="irs-cancel" variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
              <MpButton id="irs-review" variant="primary" is-rounded @click="reviewFile">{{ t('Review import') }}</MpButton>
            </MpButtonGroup>
          </footer>
        </template>

        <!-- ─────────── Preview before commit ─────────── -->
        <template v-else-if="stage === 'preview'">
          <MpBanner v-if="rejected.length" id="irs-preview-banner" variant="warning" is-inline class="irs-banner">
            <MpBannerIcon id="irs-preview-banner-icon" />
            <MpBannerDescription id="irs-preview-banner-desc">
              {{ tf('{n} rows will be updated and {m} will be skipped. Fix the skipped rows in your file and import them again.', { n: toUpdate.length, m: rejected.length }) }}
            </MpBannerDescription>
          </MpBanner>
          <MpBanner v-else id="irs-preview-ok" variant="info" is-inline class="irs-banner">
            <MpBannerIcon id="irs-preview-ok-icon" />
            <MpBannerDescription id="irs-preview-ok-desc">
              {{ tf('{n} rows will be updated and {m} already match. Nothing has been saved yet.', { n: toUpdate.length, m: unchanged.length }) }}
            </MpBannerDescription>
          </MpBanner>

          <h2 class="irs-preview-title">{{ t('Review changes') }}</h2>
          <p class="irs-step-desc">{{ t('This is what the file will do to your replenishment settings.') }}</p>

          <ErpTablePage
            class="irs-table"
            :columns="columns"
            :rows="previewRows"
            :total="previewRows.length"
            :current-page="1"
            :per-page="previewRows.length || 1"
            no-row-hover
          >
            <template #cell-productName="{ row }">
              <span v-if="(row as PreviewRow).productName">{{ (row as PreviewRow).productName }}</span>
              <span v-else class="irs-muted">{{ t('Not found') }}</span>
            </template>
            <template #cell-outcome="{ row }">
              <span v-if="(row as PreviewRow).outcome === 'rejected'" class="irs-bad">{{ t((row as PreviewRow).error) }}</span>
              <span v-else-if="(row as PreviewRow).outcome === 'update'" class="irs-ok">{{ t('Will be updated') }}</span>
              <span v-else class="irs-muted">{{ t('No change') }}</span>
            </template>
          </ErpTablePage>

          <p v-if="importError" class="irs-error">{{ importError }}</p>
          <footer class="irs-footer">
            <MpButtonGroup class="erp-action-footer">
              <MpButton id="irs-back" variant="ghost" is-rounded @click="stage = 'upload'">{{ t('Back') }}</MpButton>
              <MpButton id="irs-import" variant="primary" is-rounded @click="commitImport">
                {{ tf('Import {n} rows', { n: toUpdate.length }) }}
              </MpButton>
            </MpButtonGroup>
          </footer>
        </template>

        <!-- ─────────── Result ─────────── -->
        <template v-else>
          <div class="irs-result">
            <h2 class="irs-result-title">{{ t('Import finished') }}</h2>
            <p class="irs-result-desc">
              {{ tf('{n} rows updated, {m} unchanged, {k} skipped', { n: written, m: unchanged.length, k: rejected.length }) }}
            </p>
            <div class="irs-result-actions">
              <MpButton v-if="rejected.length" id="irs-error-report" variant="secondary" is-rounded @click="downloadErrorReport">{{ t('Download error report') }}</MpButton>
              <MpButton id="irs-done" variant="primary" is-rounded @click="goBack">{{ t('Back to replenishment') }}</MpButton>
            </div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
.irs-page { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.irs-titlebar { padding: var(--mp-spacing-4) var(--mp-spacing-6) var(--mp-spacing-3); }
/* MpTextlink pins 14px with a layered !important; scale it to the 12px breadcrumb. */
.irs-breadcrumb { display: flex; width: fit-content; zoom: calc(12 / 14); }
.irs-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.irs-stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--mp-background-default, #fff);
  border-top-left-radius: var(--mp-radii-lg);
  border-top-right-radius: var(--mp-radii-lg);
  padding: var(--mp-spacing-6);
}
.irs-wrapper { max-width: 880px; }
.irs-intro {
  margin: 0 0 var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.irs-banner { margin-bottom: var(--mp-spacing-5); }

/* ── Stepper ── */
.irs-stepper { display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.irs-step { display: flex; gap: var(--mp-spacing-4); }
.irs-step-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: var(--mp-sizes-8, 32px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  align-self: flex-start;
  aspect-ratio: 1;
}
.irs-step-body { flex: 1; min-width: 0; }
.irs-step-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.irs-step-desc {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

/* ── Format requirements accordion ── */
.irs-accordion { margin-top: var(--mp-spacing-4); }
.irs-accordion-head {
  height: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md);
  background: none;
  padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  cursor: pointer;
}
/* The reset strips list markers globally, so they are restored explicitly. */
.irs-accordion-list {
  list-style: disc outside;
  margin: var(--mp-spacing-3) 0 0;
  padding-left: var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.irs-accordion-list li { display: list-item; margin-bottom: var(--mp-spacing-1); }

.irs-error {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-critical, #c0392b);
}

/* ── Preview ── */
.irs-preview-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.irs-table { margin-top: var(--mp-spacing-4); }
.irs-bad { color: var(--mp-text-critical, #c0392b); }
.irs-ok { color: var(--mp-text-secondary); }
.irs-muted { color: var(--mp-text-secondary); }

/* ── Footer ── */
.irs-footer {
  margin-top: var(--mp-spacing-8);
  padding-top: var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}

/* ── Result ── */
.irs-result { padding-block: var(--mp-spacing-8); }
.irs-result-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.irs-result-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.irs-result-actions { display: flex; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-5); }

@media (max-width: 640px) {
  .irs-stage { padding: var(--mp-spacing-4); }
}
</style>
