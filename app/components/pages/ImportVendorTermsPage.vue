<script setup lang="ts">
/**
 * Import ordering terms for one vendor (TS-011, US-28 … US-30).
 *
 * Why this page exists at all: MoQ and purchase multiple are the only two fields
 * on the Vendor Products tab a person has to type. On a vendor with hundreds of
 * products, typing them one row at a time means they stay blank, and a blank field
 * moves no outcome. The PRD reinstated bulk import for exactly that reason
 * (decision 2026-09-18).
 *
 * What this page does that the other import pages do not: it PREVIEWS before it
 * commits (US-29). The user sees every parsed row, which ones will be written and
 * which ones will be rejected and why, before anything changes. Import is the one
 * flow where "undo" is expensive, so the confirmation has to carry real
 * information rather than a row count.
 *
 * Partial commit is deliberate (US-30): valid rows are written, invalid rows are
 * not, and the rejected ones come back as a downloadable report naming the row
 * number and the reason. Rejecting the whole file over one typo would push people
 * back to typing.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { MpIcon, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpDropzone from '~/components/patterns/ErpDropzone.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ScenarioFab, { type Scenario } from '~/components/patterns/ScenarioFab.vue'
import { getContact } from '~/data/contacts'
import { vendorItemsForVendor, upsertVendorItem } from '~/data/vendorItems'
import { recordTermsChange } from '~/data/vendorTermsAudit'
import { productBySku } from '~/data/inventory'
import { successToast, errorToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const contact = computed(() => getContact(props.orderId))
const vendorMasterId = computed(() => contact.value?.vendorMasterId ?? '')

/**
 * The import row limit is still TBD in the PRD (owner: Engineering Manager).
 * It is stated up front anyway — US-28 requires the number to be visible BEFORE
 * upload, because discovering it after a failed 5,000-row import is the worst
 * possible moment. When the real figure lands, change this constant only.
 */
const ROW_LIMIT = 1000
const MAX_MB = 10

type Stage = 'upload' | 'preview' | 'done'
const stage = ref<Stage>('upload')
const file = ref<File | null>(null)
const formatOpen = ref(false)
const uploadError = ref('')

/** Demo scenarios — the three outcomes an import can actually reach. */
const SCENARIOS: Scenario[] = [
  { label: 'All rows valid', value: 'clean' },
  { label: 'Some rows rejected', value: 'partial' },
  { label: 'File rejected', value: 'rejected' },
]
const scenario = ref<'clean' | 'partial' | 'rejected'>('partial')

interface PreviewRow extends Record<string, unknown> {
  id: string
  rowNumber: number
  sku: string
  product: string
  moq: number | null
  purchaseMultiple: number | null
  error: string
}

/**
 * Parsed rows.
 *
 * A real implementation reads the uploaded sheet; here the vendor's existing
 * products stand in for it, with deterministic faults injected so every rejection
 * reason on the list is reachable from the preview.
 */
const previewRows = computed<PreviewRow[]>(() => {
  const items = vendorItemsForVendor(vendorMasterId.value).filter((vi) => vi.active !== false)
  return items.map((vi, i) => {
    const product = productBySku(vi.sku)
    // Injected faults, only in the "partial" scenario.
    const faulty = scenario.value === 'partial' && (i === 1 || i === 4)
    const unknownSku = scenario.value === 'partial' && i === 6
    return {
      id: `imp-${vi.sku}`,
      rowNumber: i + 2, // row 1 is the header
      sku: unknownSku ? 'SKU-UNKNOWN' : vi.sku,
      product: unknownSku ? '' : (product?.name ?? vi.sku),
      moq: faulty ? 0 : vi.moq + 25,
      purchaseMultiple: vi.packSize,
      error: unknownSku
        ? t('Product code not found in your catalogue')
        : faulty
          ? t('Min. order qty must be a whole number above 0')
          : '',
    }
  })
})

const validRows = computed(() => previewRows.value.filter((r) => !r.error))
const rejectedRows = computed(() => previewRows.value.filter((r) => r.error))

// `rowNumber` is a layout-only counter, so it keeps an explicit width; every
// other column takes its width from the semantic standard.
const columns = computed<TableColumn[]>(() => [
  { key: 'rowNumber', label: t('Row'), width: '72px' },
  { key: 'product', label: t('Product'), kind: 'name' },
  { key: 'sku', label: t('Product code'), kind: 'number' },
  { key: 'moq', label: t('Min. order qty'), align: 'right' },
  { key: 'purchaseMultiple', label: t('Purchase multiple'), align: 'right' },
  { key: 'error', label: t('Status'), kind: 'address' },
])

function goBack(): void {
  router.push(`/vendors/${props.orderId}?tab=products`)
}

function onFileChange(list: FileList): void {
  const f = list[0]
  if (!f) return
  uploadError.value = ''
  if (f.size > MAX_MB * 1024 * 1024) {
    uploadError.value = t('File size exceeds the 10 MB limit')
    return
  }
  if (!/\.(csv|xls|xlsx)$/i.test(f.name)) {
    uploadError.value = t('File format not supported. Upload a CSV, XLS, or XLSX file')
    return
  }
  file.value = f
}

function removeFile(): void {
  file.value = null
  uploadError.value = ''
}

/** Step 2 → preview. The action is always clickable; an unmet precondition
 *  produces an inline error, not a disabled button. */
function reviewFile(): void {
  if (!file.value) {
    uploadError.value = t('You must upload a file')
    return
  }
  if (scenario.value === 'rejected') {
    uploadError.value = t('File structure is incorrect. Use the provided template without modifying the columns')
    return
  }
  uploadError.value = ''
  stage.value = 'preview'
}

/** Commit. Valid rows are written; rejected rows are left untouched (US-30). */
function commitImport(): void {
  for (const r of validRows.value) {
    const existing = vendorItemsForVendor(vendorMasterId.value).find((vi) => vi.sku === r.sku)
    upsertVendorItem({
      vendorId: vendorMasterId.value,
      sku: r.sku,
      moq: r.moq ?? undefined,
      packSize: r.purchaseMultiple ?? undefined,
    })
    // Imported changes are attributed like any other terms change, with the
    // source recorded so a dispute can tell a spreadsheet from a person.
    if (existing && existing.moq !== r.moq) {
      recordTermsChange(
        vendorMasterId.value, r.sku,
        [{ label: t('Min. order qty'), from: String(existing.moq), to: String(r.moq) }],
        'Haidar', 'Spreadsheet import',
      )
    }
  }
  stage.value = 'done'
  if (rejectedRows.value.length) {
    errorToast(`${rejectedRows.value.length} ${t('rows failed to import')}`)
  } else {
    successToast(t('Ordering terms imported'))
  }
}
</script>

<template>
  <div class="ivt-page">
    <div class="ivt-titlebar">
      <div class="ivt-titlebar-left">
        <button class="btn-enterprise btn-enterprise--plain ivt-breadcrumb" type="button" @click="goBack">{{ contact?.displayName ?? t('Vendor') }}</button>
        <h1 class="ivt-title">{{ t('Import ordering terms') }}</h1>
      </div>
    </div>

    <div class="ivt-stage">
      <div class="ivt-wrapper">

        <!-- ─────────── Upload ─────────── -->
        <template v-if="stage === 'upload'">
          <p class="ivt-intro">
            {{ t('Import minimum order quantity and purchase multiple for this vendor from a spreadsheet. Prices are not imported: they are read from approved supplier invoices.') }}
          </p>

          <div class="ivt-stepper">
            <section class="ivt-step">
              <div class="ivt-step-badge">1</div>
              <div class="ivt-step-body">
                <h2 class="ivt-step-title">{{ t('Download the template') }}</h2>
                <p class="ivt-step-desc">{{ t('The template is pre-filled with this vendor’s current products and terms, so you only change what has moved.') }}</p>
                <button class="btn-enterprise btn-enterprise--secondary" type="button">
                  {{ t('Download template file') }}
                </button>

                <div class="ivt-accordion">
                  <button class="btn-enterprise btn-enterprise--plain ivt-accordion-head" type="button" @click="formatOpen = !formatOpen">
                    <span>{{ t('Format requirements') }}</span>
                    <MpIcon :name="formatOpen ? 'arrows-up' : 'arrows-down'" size="sm" />
                  </button>
                  <ul v-if="formatOpen" class="ivt-accordion-list">
                    <!-- The row limit is stated BEFORE upload, not after a failure. -->
                    <li>{{ t('Maximum') }} {{ ROW_LIMIT.toLocaleString('id-ID') }} {{ t('rows per file') }}</li>
                    <li>{{ t('Minimum order quantity and purchase multiple must be whole numbers above 0') }}</li>
                    <li>{{ t('Leave a cell empty to clear a term that is no longer agreed') }}</li>
                    <li>{{ t('Do not use thousand separators (e.g. 1000, not 1.000)') }}</li>
                    <li>{{ t('Do not change or reorder the template columns') }}</li>
                  </ul>
                </div>
              </div>
            </section>

            <section class="ivt-step">
              <div class="ivt-step-badge">2</div>
              <div class="ivt-step-body">
                <h2 class="ivt-step-title">{{ t('Upload your file') }}</h2>
                <p class="ivt-step-desc">{{ t('You will see exactly what will change before anything is saved.') }}</p>

                <ErpDropzone
                  id="ivt-dropzone"
                  accept=".csv,.xls,.xlsx"
                  formats="CSV, XLS, XLSX"
                  :max-size="`${MAX_MB} MB`"
                  :files="file ? [{ name: file.name }] : []"
                  :is-invalid="!!uploadError"
                  @change="onFileChange"
                  @remove="removeFile"
                />
                <p v-if="uploadError" class="ivt-error">{{ uploadError }}</p>
              </div>
            </section>
          </div>

          <footer class="ivt-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="goBack">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="reviewFile">{{ t('Review import') }}</button>
          </footer>
        </template>

        <!-- ─────────── Preview before commit (US-29) ─────────── -->
        <template v-else-if="stage === 'preview'">
          <MpBanner
            v-if="rejectedRows.length"
            id="ivt-preview-banner"
            variant="warning"
            is-inline
            class="ivt-banner"
          >
            <MpBannerIcon id="ivt-preview-banner-icon" />
            <MpBannerDescription id="ivt-preview-banner-desc">
              {{ validRows.length }} {{ t('rows will be imported and') }} {{ rejectedRows.length }} {{ t('will be skipped. Fix the skipped rows in your file and import them again.') }}
            </MpBannerDescription>
          </MpBanner>
          <MpBanner v-else id="ivt-preview-ok" variant="info" is-inline class="ivt-banner">
            <MpBannerIcon id="ivt-preview-ok-icon" />
            <MpBannerDescription id="ivt-preview-ok-desc">
              {{ t('All') }} {{ validRows.length }} {{ t('rows are ready to import. Nothing has been saved yet.') }}
            </MpBannerDescription>
          </MpBanner>

          <h2 class="ivt-preview-title">{{ t('Review changes') }}</h2>
          <p class="ivt-step-desc">{{ t('This is what the file will do to this vendor’s ordering terms.') }}</p>

          <ErpTablePage
            class="ivt-table"
            :columns="columns"
            :rows="previewRows"
            :total="previewRows.length"
            :current-page="1"
            :per-page="previewRows.length || 1"
            no-row-hover
          >
            <template #cell-product="{ row }">
              <span v-if="(row as PreviewRow).product">{{ (row as PreviewRow).product }}</span>
              <span v-else class="ivt-muted">{{ t('Not found') }}</span>
            </template>
            <template #cell-moq="{ row }">
              <span :class="{ 'ivt-bad': (row as PreviewRow).error }">{{ (row as PreviewRow).moq }}</span>
            </template>
            <!-- Status states the row-level outcome and its reason in the row
                 itself, so the error report is a copy of what is on screen, not
                 the only place the reason exists. -->
            <template #cell-error="{ row }">
              <span v-if="(row as PreviewRow).error" class="ivt-bad">{{ (row as PreviewRow).error }}</span>
              <span v-else class="ivt-ok">{{ t('Will be imported') }}</span>
            </template>
          </ErpTablePage>

          <footer class="ivt-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="stage = 'upload'">{{ t('Back') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="commitImport">
              {{ t('Import') }} {{ validRows.length }} {{ t('rows') }}
            </button>
          </footer>
        </template>

        <!-- ─────────── Result ─────────── -->
        <template v-else>
          <div class="ivt-result">
            <h2 class="ivt-result-title">{{ t('Import finished') }}</h2>
            <p class="ivt-result-desc">
              {{ validRows.length }} {{ t('rows imported') }}<template v-if="rejectedRows.length">, {{ rejectedRows.length }} {{ t('skipped') }}</template>.
            </p>
            <div class="ivt-result-actions">
              <button
                v-if="rejectedRows.length"
                class="btn-enterprise btn-enterprise--secondary"
                type="button"
              >{{ t('Download error report') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="goBack">
                {{ t('Back to products') }}
              </button>
            </div>
          </div>
        </template>

      </div>
    </div>

    <ScenarioFab v-model="scenario" :scenarios="SCENARIOS" :aria-label="t('Import scenarios')" />
  </div>
</template>

<style scoped>
.ivt-page { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.ivt-titlebar { padding: var(--mp-spacing-4) var(--mp-spacing-6) var(--mp-spacing-3); }
.ivt-breadcrumb {
  border: 0;
  background: none;
  padding: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  cursor: pointer;
}
.ivt-breadcrumb:hover { text-decoration: underline; }
.ivt-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ivt-stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--mp-background-default, #fff);
  border-top-left-radius: var(--mp-radii-lg);
  border-top-right-radius: var(--mp-radii-lg);
  padding: var(--mp-spacing-6);
}
.ivt-wrapper { max-width: 880px; }
.ivt-intro {
  margin: 0 0 var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.ivt-banner { margin-bottom: var(--mp-spacing-5); }

/* ── Stepper ── */
.ivt-stepper { display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.ivt-step { display: flex; gap: var(--mp-spacing-4); }
.ivt-step-badge {
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
.ivt-step-body { flex: 1; min-width: 0; }
.ivt-step-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ivt-step-desc {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

/* ── Format requirements accordion ── */
.ivt-accordion { margin-top: var(--mp-spacing-4); }
.ivt-accordion-head {
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
.ivt-accordion-list {
  list-style: disc outside;
  margin: var(--mp-spacing-3) 0 0;
  padding-left: var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.ivt-accordion-list li { display: list-item; margin-bottom: var(--mp-spacing-1); }

.ivt-error {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-critical, #c0392b);
}

/* ── Preview ── */
.ivt-preview-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ivt-table { margin-top: var(--mp-spacing-4); }
.ivt-bad { color: var(--mp-text-critical, #c0392b); }
.ivt-ok { color: var(--mp-text-secondary); }
.ivt-muted { color: var(--mp-text-secondary); }

/* ── Footer ── */
.ivt-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-8);
  padding-top: var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}

/* ── Result ── */
.ivt-result { padding-block: var(--mp-spacing-8); }
.ivt-result-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ivt-result-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ivt-result-actions { display: flex; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-5); }

@media (max-width: 640px) {
  .ivt-stage { padding: var(--mp-spacing-4); }
  .ivt-footer { flex-direction: column-reverse; }
}
</style>
