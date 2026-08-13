<script setup lang="ts">
/**
 * Data migration → WMS cutover → Step 1: Chart of accounts.
 *
 * The customer upgrading from WMS-only to ERP must first have a chart of
 * accounts before any SKU can be routed to one. Two paths, committed on
 * Continue (no per-card button):
 *   - Adopt ERP's default chart (just select the radio).
 *   - Import their own chart (accounts only — code, name, type; opening
 *     balances come later, in Step 3). Upload one file with MpUpload.
 * Either way the choice lands in one live `coaAccounts` list that Step 2's
 * mapping reads from.
 *
 * Route: /data-migration/wms-cutover/chart-of-accounts (detailMatch → owns its
 * own 72px title bar + stage, per DESIGN.md → Layout → Stage).
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { MpIcon, MpUpload, MpUploadList, MpProgress, MpButton, MpText, MpTextlink, toast } from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import FormatRequirementsAccordion from '~/components/patterns/FormatRequirementsAccordion.vue'
import {
  CUTOVER_STEPS, isCutoverStepComplete, type CutoverStep,
  coaSourceState, coaAccounts, useDefaultCoa, importOwnCoa, type CoaAccount,
} from '~/data/wmsCutover'

const { t } = useLocale()
const router = useRouter()

// ── Stepper ─────────────────────────────────────────────────────────────────
const doneSteps = computed(() => CUTOVER_STEPS.filter((s) => isCutoverStepComplete(s.key)).map((s) => s.key))
function goStep(step: CutoverStep) {
  router.push(`/data-migration/wms-cutover/${step}`)
}

// ── Choice ──────────────────────────────────────────────────────────────────
// Which option is selected. Defaults to the ERP default chart (or the committed
// source when revisiting).
const choice = ref<'default' | 'own'>(coaSourceState.source ?? 'default')
const committedSource = computed(() => coaSourceState.source)

// Formatting rules for the chart-of-accounts template (Format requirements accordion).
const coaFormatRequirements = computed(() => [
  t('Maximum 1.000 rows per file.'),
  t('One row per account, with a code, name, and type.'),
  t('Account type must be Asset, Liability, Equity, Income, or Expense.'),
  t('Do not include currency symbols (Rp, $, etc.).'),
  t('Tip: add a backtick (`) before account codes to prevent auto-formatting. Example: `1-10200'),
])

function typeLabel(type?: CoaAccount['type']): string {
  if (type === 'inventory') return t('Inventory')
  if (type === 'revenue') return t('Revenue')
  if (type === 'cogs') return t('Cost of goods sold')
  return t('Other')
}

// ── Own-COA import: pick a file → Import (progress) → done → Preview drawer ──
type ImportPhase = 'idle' | 'importing' | 'done'
const importFile = ref<File | null>(null)
const importPhase = ref<ImportPhase>(coaSourceState.source === 'own' ? 'done' : 'idle')
const importProgress = ref(coaSourceState.source === 'own' ? 100 : 0)
const previewOpen = ref(false)
const MAX_IMPORT_BYTES = 10 * 1024 * 1024
let progTimer: ReturnType<typeof setInterval> | undefined

function onFileChange(payload: Event | FileList | null) {
  // MpUpload's @change emits a native Event (ev.target.files); older call sites
  // pass a FileList directly — handle both.
  const files: FileList | null | undefined =
    payload && 'target' in payload ? (payload.target as HTMLInputElement).files : (payload as FileList | null)
  const file = files?.[0]
  if (!file) return
  if (file.size > MAX_IMPORT_BYTES) {
    toast.notify({ variant: 'danger', title: t('File size exceeds the 10 MB limit'), maxWidth: 'max-content' })
    return
  }
  importFile.value = file
  importPhase.value = 'idle' // a new file needs a fresh import
  importProgress.value = 0
}
function removeImportFile() {
  importFile.value = null
  importPhase.value = 'idle'
  importProgress.value = 0
}

function runImport() {
  if (!importFile.value) {
    toast.notify({ variant: 'danger', title: t('You must upload the completed template file'), maxWidth: 'max-content' })
    return
  }
  importPhase.value = 'importing'
  importProgress.value = 0
  clearInterval(progTimer)
  progTimer = setInterval(() => {
    importProgress.value = Math.min(100, importProgress.value + 8)
    if (importProgress.value >= 100) {
      clearInterval(progTimer)
      importOwnCoa() // the file stands in for a parsed chart; adopt the sample
      importPhase.value = 'done'
      toast.notify({ variant: 'success', title: `${coaSourceState.importedCount} ${t('accounts imported')}`, maxWidth: 'max-content' })
    }
  }, 90)
}
onUnmounted(() => clearInterval(progTimer))

function openPreview() { previewOpen.value = true }
function onEsc(e: KeyboardEvent) { if (e.key === 'Escape' && previewOpen.value) previewOpen.value = false }
onMounted(() => window.addEventListener('keydown', onEsc))
onUnmounted(() => window.removeEventListener('keydown', onEsc))

// ── Nav ─────────────────────────────────────────────────────────────────────
function cancel() {
  router.push('/data-migration')
}
function saveDraft() {
  toast.notify({ variant: 'success', title: t('Saved as draft'), maxWidth: 'max-content' })
  router.push('/data-migration')
}
function onContinue() {
  if (choice.value === 'default') {
    useDefaultCoa()
    router.push('/data-migration/wms-cutover/products')
    return
  }
  // Own path: the import must finish first.
  if (importPhase.value !== 'done') {
    toast.notify({ variant: 'danger', title: t('Import your chart of accounts to continue'), maxWidth: 'max-content' })
    return
  }
  router.push('/data-migration/wms-cutover/products')
}
</script>

<template>
  <div class="coa-page">

    <!-- ── Title bar ── -->
    <div class="coa-titlebar">
      <div class="coa-titlebar-left">
        <MpTextlink id="coa-breadcrumb" as="a" class="coa-breadcrumb" @click.prevent="cancel">{{ t('Data migration') }}</MpTextlink>
        <h1 class="coa-title">{{ t('Set up opening balance') }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="coa-stage">
      <div class="coa-wrapper">

        <ErpStepper :steps="CUTOVER_STEPS" current="chart-of-accounts" :done="doneSteps" @select="goStep" />

        <div class="coa-intro">
          <p class="coa-intro-lead">
            {{ t('Every WMS product routes to a chart-of-accounts entry. Start by choosing which chart to use — you can adopt ERP\'s default, or import your own.') }}
          </p>
        </div>

        <!-- ── Two source choices (connected, no gap) ── -->
        <div class="coa-choices">

          <!-- Option A — ERP default -->
          <section
            class="coa-card"
            :class="{ 'coa-card--selected': choice === 'default' }"
            role="button"
            tabindex="0"
            @click="choice = 'default'"
            @keydown.enter.prevent="choice = 'default'"
          >
            <div class="coa-card-head">
              <span class="coa-radio" :class="{ 'coa-radio--on': choice === 'default' }" aria-hidden="true" />
              <div class="coa-card-heading">
                <div class="coa-card-title-row">
                  <h2 class="coa-card-title">{{ t('Use ERP default chart of accounts') }}</h2>
                  <span class="coa-rec">{{ t('Recommended') }}</span>
                </div>
                <p class="coa-card-desc">
                  {{ t('Adopt Mekari ERP\'s standard chart. Fastest way to start — no file to prepare.') }}
                </p>
              </div>
            </div>
          </section>

          <!-- Option B — import own -->
          <section
            class="coa-card"
            :class="{ 'coa-card--selected': choice === 'own' }"
            role="button"
            tabindex="0"
            @click="choice = 'own'"
            @keydown.enter.prevent="choice = 'own'"
          >
            <div class="coa-card-head">
              <span class="coa-radio" :class="{ 'coa-radio--on': choice === 'own' }" aria-hidden="true" />
              <div class="coa-card-heading">
                <div class="coa-card-title-row">
                  <h2 class="coa-card-title">{{ t('Import my own chart of accounts') }}</h2>
                  <span v-if="committedSource === 'own'" class="coa-inuse">
                    <MpIcon name="check" size="sm" color="icon.positive" /> {{ t('In use') }}
                  </span>
                </div>
                <p class="coa-card-desc">
                  {{ t('Bring your existing accounts into ERP first (code, name, and type). Opening balances are set later.') }}
                </p>
              </div>
            </div>

            <div v-if="choice === 'own'" class="coa-card-body" @click.stop>
              <ul class="coa-import-steps">
                <li>{{ t('Download the template and fill in your accounts.') }}</li>
                <li>{{ t('Upload the completed file below.') }}</li>
              </ul>

              <button type="button" class="btn-enterprise btn-enterprise--secondary">
                {{ t('Download template file') }}
              </button>

              <div class="coa-form-grid">
                <div class="coa-field">
                  <FormatRequirementsAccordion :requirements="coaFormatRequirements" />
                </div>
              </div>

              <div class="coa-form-grid">
                <div class="coa-field">
                  <label class="coa-field-label" for="coa-own-upload">{{ t('Upload accounts') }}</label>
                  <MpUpload
                    id="coa-own-upload"
                    accept=".csv,.xls,.xlsx"
                    is-full-width
                    :placeholder="t('or drag and drop here')"
                    :button-text="t('Choose file')"
                    @change="onFileChange"
                  />
                  <p class="coa-upload-hint">{{ t('File must be in CSV, XLS, or XLSX with a maximum of 10 MB') }}</p>

                  <MpUploadList
                    v-if="importFile"
                    id="coa-own-file"
                    :title="importFile.name"
                    status="success"
                    :subtitle="importPhase === 'done' ? t('Imported') : t('Ready to import')"
                    icon-name="excel-document"
                    :is-show-download-button="false"
                    :is-show-remove-button="importPhase !== 'importing'"
                    @remove="removeImportFile"
                  />
                </div>
              </div>

              <!-- Import → progress → done + Preview -->
              <div v-if="importFile" class="coa-import-action">
                <button
                  v-if="importPhase === 'idle'"
                  type="button"
                  class="btn-enterprise btn-enterprise--secondary"
                  @click="runImport"
                >
                  {{ t('Import') }}
                </button>

                <div v-else-if="importPhase === 'importing'" class="coa-import-progress">
                  <MpProgress :value="String(importProgress)" size="sm" color="information" />
                  <span class="coa-import-progress-text">{{ t('Importing accounts…') }} {{ importProgress }}%</span>
                </div>

                <div v-else class="coa-import-done">
                  <span class="coa-import-done-msg">
                    <MpIcon name="check" size="sm" color="icon.positive" />
                    {{ coaSourceState.importedCount }} {{ t('accounts imported') }}
                  </span>
                  <MpTextlink id="coa-preview-link" as="a" @click.prevent="openPreview">{{ t('Preview') }}</MpTextlink>
                </div>
              </div>
            </div>
          </section>
        </div>

      </div>
    </div>

    <!-- ── Imported COA preview drawer ── -->
    <Teleport to="body">
      <Transition name="coa-dw">
        <div v-if="previewOpen" class="coa-dw-overlay" @click.self="previewOpen = false">
          <aside class="coa-dw-panel" role="dialog" :aria-label="t('Imported chart of accounts')">
            <header class="coa-dw-header">
              <MpText weight="semiBold">{{ t('Imported chart of accounts') }}</MpText>
              <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="previewOpen = false" />
            </header>
            <div class="coa-dw-body">
              <p class="coa-dw-count">{{ coaAccounts.length }} {{ t('accounts imported') }}</p>
              <div class="coa-dw-table-wrap">
                <table class="coa-dw-table">
                  <thead>
                    <tr>
                      <th class="coa-dw-th">{{ t('Account code') }}</th>
                      <th class="coa-dw-th">{{ t('Account name') }}</th>
                      <th class="coa-dw-th">{{ t('Account type') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in coaAccounts" :key="a.code">
                      <td class="coa-dw-td coa-dw-td--code">{{ a.code }}</td>
                      <td class="coa-dw-td">{{ a.name }}</td>
                      <td class="coa-dw-td coa-dw-td--type">{{ typeLabel(a.type) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Sticky footer (first step — no Back) ── -->
    <footer class="coa-footer">
      <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancel">
        {{ t('Cancel') }}
      </button>
      <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="saveDraft">
        {{ t('Save as draft') }}
      </button>
      <button type="button" class="btn-enterprise btn-enterprise--primary" @click="onContinue">
        {{ t('Continue') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.coa-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── Title bar (mirrors the products/opening-balance cutover pages) ── */
.coa-titlebar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.coa-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}
.coa-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  white-space: nowrap;
}
.coa-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.coa-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.coa-stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}
.coa-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  max-width: 860px;
}

/* ── Intro ── */
.coa-intro { max-width: 760px; }
.coa-intro-lead {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* ── Choice options — plain radio rows, no box, no padding, 12px apart ── */
.coa-choices {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3); /* 12px between the two radios */
}
.coa-card {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  cursor: pointer;
}

.coa-card-head {
  display: flex;
  gap: var(--mp-spacing-3);
  align-items: flex-start;
}
.coa-radio {
  flex-shrink: 0;
  margin-top: 2px;
  width: 18px;
  height: 18px;
  border-radius: var(--mp-radii-full, 999px);
  border: 2px solid var(--mp-border-bold, #8c9596);
  background: var(--mp-background-neutral, #ffffff);
}
.coa-radio--on {
  border-color: var(--mp-border-brand-bold, #12b886);
  background:
    radial-gradient(circle, var(--mp-background-brand-bold, #12b886) 0 5px, transparent 6px);
}
.coa-card-heading {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  min-width: 0;
}
.coa-card-title-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  flex-wrap: wrap;
}
.coa-card-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg);
  color: var(--mp-text-default);
}
.coa-rec {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-brand, #0a7c5a);
  background: var(--mp-background-brand-subtle, #e6f7f1);
  padding: 2px var(--mp-spacing-2);
  border-radius: var(--mp-radii-full, 999px);
}
.coa-inuse {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-positive, #2fa36b);
}
.coa-card-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* Card body (revealed on select) — aligns with the title, past the radio. */
.coa-card-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  align-items: flex-start;
  padding-left: calc(18px + var(--mp-spacing-3));
  cursor: default;
}

/* Import steps — a real bulleted list (discs must show). */
.coa-import-steps {
  margin: 0;
  padding-left: var(--mp-spacing-5);
  list-style: disc;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.coa-import-steps li { margin: 0; }
.coa-import-steps li + li { margin-top: var(--mp-spacing-1); }

/* Upload sits in the form's 12-col grid, spanning 6 columns. The extra top
   margin makes the gap from the Download-template button 20px (body gap 12 + 8). */
.coa-form-grid {
  width: 100%;
  margin-top: var(--mp-spacing-2);
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--mp-spacing-4);
}
.coa-field {
  grid-column: span 6;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}
.coa-field-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.coa-upload-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

/* Import action / progress / done */
.coa-import-action { display: flex; }
.coa-import-progress {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}
.coa-import-progress-text {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
}
.coa-import-done {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.coa-import-done-msg {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-positive, #2fa36b);
}

/* ── Imported COA preview drawer (self-contained overlay) ── */
.coa-dw-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.coa-dw-panel {
  margin: var(--mp-spacing-3);
  width: min(560px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}
.coa-dw-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.coa-dw-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-5) var(--mp-spacing-6); }
.coa-dw-count { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.coa-dw-table-wrap { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.coa-dw-table { width: 100%; border-collapse: collapse; }
.coa-dw-th {
  position: sticky; top: 0;
  height: var(--mp-sizes-9, 36px);
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-wide, 0.4px);
  color: var(--mp-text-secondary); text-align: left; white-space: nowrap;
}
.coa-dw-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle;
}
.coa-dw-table tbody tr:last-child .coa-dw-td { border-bottom: none; }
.coa-dw-td--code { color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.coa-dw-td--type { color: var(--mp-text-secondary); white-space: nowrap; }

.coa-dw-enter-active, .coa-dw-leave-active { transition: background-color 250ms ease; }
.coa-dw-enter-from, .coa-dw-leave-to { background-color: transparent; }
.coa-dw-enter-active .coa-dw-panel { transition: transform 350ms ease-out; }
.coa-dw-leave-active .coa-dw-panel { transition: transform 250ms ease-in; }
.coa-dw-enter-from .coa-dw-panel,
.coa-dw-leave-to .coa-dw-panel { transform: translateX(calc(100% + 12px)); }

/* ── Sticky footer (flex sibling below the scrolling stage) ── */
.coa-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}
</style>
