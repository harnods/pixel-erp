<script setup lang="ts">
/**
 * ImportBatchUpdatePage — Update batches from spreadsheet (Batch Attribute PRD story 9;
 * plan Phase 4, docs/prd/batch-attribute-plan.md).
 *
 * A spreadsheet import with a downloadable template is a stepped page, not the
 * file-drop modal (rule/import-modal). Step 1 downloads the template — prefilled with
 * the product's current batches so it can be edited in place; step 2 uploads the
 * completed file (ErpDropzone, rule/import-modal-dropzone). Import validates every
 * row (app/data/batchUpdateImport.ts) and applies only the valid ones: all valid →
 * success toast and back to the product; any invalid → a result view listing each
 * rejected row with its reasons, plus a downloadable error file.
 *
 * Route: /product-list/import-batches?sku=<sku>. Without a sku the template covers
 * every batch-tracked product (one file can span products, PRD).
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MpButton, MpIcon, MpTextlink } from '@mekari/pixel3'
import ErpDropzone from '~/components/patterns/ErpDropzone.vue'
import FormatRequirementsAccordion from '~/components/patterns/FormatRequirementsAccordion.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import { productIndexRows } from '~/data/productsIndex'
import { isProductBatchTracked } from '~/data/productDetails'
import {
  BATCH_UPDATE_COLUMNS, applyBatchUpdateImport, batchUpdateTemplateRows, validateBatchUpdateRows,
  type BatchUpdateCells, type BatchUpdateImportResult, type BatchUpdateRow,
} from '~/data/batchUpdateImport'
import { successToast } from '~/utils/toasts'

const route = useRoute()
const router = useRouter()
const { t } = useLocale()

const sku = computed(() => (typeof route.query.sku === 'string' ? route.query.sku : ''))
const product = computed(() => (sku.value ? productIndexRows().find((r) => r.sku === sku.value) : undefined))

const ACCEPTED_EXTS = ['csv', 'xls', 'xlsx']
const MAX_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 1000

const formatRequirements = computed(() => [
  t('Fill in Product name and Batch number exactly as they are in Mekari ERP. Batch numbers can’t be changed through import'),
  t('Leave a cell blank to keep its current value, or type null to remove it'),
  t('Expiry date: DD/MM/YYYY, or MM/YYYY for a month'),
  t('Manufacturing date and Best before date: DD/MM/YYYY'),
  t('Vendor and Grade: use the name as it is in Mekari ERP. The grade must be active'),
  t('Fill in only the attributes the product uses. The Unassigned batch can’t have attributes'),
  t('Maximum 1.000 rows per file'),
])

// ── Template / error file ────────────────────────────────────────────────────
const templateSkus = computed(() =>
  product.value ? [product.value.sku] : productIndexRows().filter((r) => isProductBatchTracked(r.sku)).map((r) => r.sku),
)

async function writeSheet(filename: string, header: string[], rows: string[][]) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows])
  sheet['!cols'] = header.map((h) => ({ wch: Math.max(16, h.length + 2) }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Batches')
  XLSX.writeFile(book, filename)
}

const cellsOf = (r: BatchUpdateCells) => BATCH_UPDATE_COLUMNS.map((c) => r[c.key])
const headerLabels = () => BATCH_UPDATE_COLUMNS.map((c) => t(c.label))

function downloadTemplate() {
  void writeSheet('update-batches-template.xlsx', headerLabels(), batchUpdateTemplateRows(templateSkus.value).map(cellsOf))
}

// ── Upload ───────────────────────────────────────────────────────────────────
const file = ref<File | null>(null)
const processing = ref(false)
/** Set only when Import is clicked — never on file selection. */
const uploadError = ref<'' | 'no-file' | 'format' | 'size' | 'template' | 'empty' | 'rows'>('')

function onFileChange(list: FileList) {
  file.value = list[0] ?? null
  uploadError.value = ''
}
function removeFile() {
  file.value = null
  uploadError.value = ''
}

const uploadErrorText = computed(() => ({
  '': '',
  'no-file': t('You must upload the completed template file'),
  format: t('File format not supported. Upload a CSV, XLS, or XLSX file'),
  size: t('File size exceeds the 10 MB limit'),
  template: t('File structure is incorrect. Use the provided template without modifying the columns'),
  empty: t('File is empty. Upload a file with data'),
  rows: t('File contains more than 1.000 rows. Split into smaller files and import separately'),
}[uploadError.value]))

function pad(n: number) { return String(n).padStart(2, '0') }

/** A cell as text; spreadsheet-typed dates come back in the import's DD/MM/YYYY. */
function cellText(v: unknown): string {
  if (v instanceof Date) return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`
  return v == null ? '' : String(v)
}

/** Read the sheet into rows keyed by template column. null = headers don't match. */
async function readRows(f: File): Promise<BatchUpdateRow[] | null> {
  const XLSX = await import('xlsx')
  const book = XLSX.read(await f.arrayBuffer(), { cellDates: true })
  const sheet = book.Sheets[book.SheetNames[0]!]
  if (!sheet) return null
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false })
  const header = (grid[0] ?? []).map((h) => cellText(h).trim().toLowerCase())
  // Headers match in English or in the current language, in any order.
  const index = BATCH_UPDATE_COLUMNS.map((c) => {
    const names = [c.label.toLowerCase(), t(c.label).toLowerCase()]
    return header.findIndex((h) => names.includes(h))
  })
  if (index.some((i) => i < 0)) return null
  return grid.slice(1)
    .map((cells, i) => {
      const row = { rowNumber: i + 2 } as BatchUpdateRow
      BATCH_UPDATE_COLUMNS.forEach((c, k) => { row[c.key] = cellText(cells[index[k]!]).trim() })
      return row
    })
    .filter((r) => BATCH_UPDATE_COLUMNS.some((c) => r[c.key]))
}

// ── Import ───────────────────────────────────────────────────────────────────
const result = ref<BatchUpdateImportResult | null>(null)

function goBack() {
  router.push(product.value ? { path: `/product-list/${product.value.sku}`, query: { section: 'batches' } } : '/product-list')
}

function finish(outcome: BatchUpdateImportResult) {
  if (!outcome.failed.length) {
    successToast(t('Batches updated'))
    goBack()
    return
  }
  result.value = outcome
}

async function doImport() {
  if (!file.value) return void (uploadError.value = 'no-file')
  const ext = file.value.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ACCEPTED_EXTS.includes(ext)) return void (uploadError.value = 'format')
  if (file.value.size > MAX_BYTES) return void (uploadError.value = 'size')

  processing.value = true
  try {
    const rows = await readRows(file.value)
    if (!rows) return void (uploadError.value = 'template')
    if (!rows.length) return void (uploadError.value = 'empty')
    if (rows.length > MAX_ROWS) return void (uploadError.value = 'rows')
    uploadError.value = ''
    finish(applyBatchUpdateImport(rows, 'Daniel Senjoyo'))
  } catch {
    uploadError.value = 'template'
  } finally {
    processing.value = false
  }
}

function importAgain() {
  result.value = null
  file.value = null
  uploadError.value = ''
  scenario.value = 'live'
}

const importedCount = computed(() => (result.value ? result.value.total - result.value.failed.length : 0))

/** Row errors are PRD story 9 copy. The two attribute messages carry the attribute's
 *  label, so they translate through a template rather than a fixed key. */
function importErrorText(e: string): string {
  const notUsed = /^This product does not use Attribute (.+)$/.exec(e)
  if (notUsed) return t('This product does not use Attribute {attribute}').replace('{attribute}', t(notUsed[1]!))
  const required = /^Attribute (.+) must be filled$/.exec(e)
  if (required) return t('Attribute {attribute} must be filled').replace('{attribute}', t(required[1]!))
  return t(e)
}

function downloadErrorFile() {
  if (!result.value) return
  const rows = result.value.failed.map((f) => [String(f.rowNumber), f.productName, f.batchNumber, f.errors.map(importErrorText).join('; ')])
  void writeSheet('update-batches-errors.xlsx', [t('Row'), t('Product name'), t('Batch number'), t('Errors')], rows)
}

// ── Scenarios (prototype) ────────────────────────────────────────────────────
// Demo outcomes run the real validator on sample rows; nothing is written.
const scenario = ref('live')
const scenarios = [
  { label: 'Default', value: 'live' },
  { label: 'Import succeeded', value: 'success' },
  { label: 'Some rows failed', value: 'partial' },
  { label: 'All rows failed', value: 'failed' },
]

function sampleRows(): BatchUpdateRow[] {
  const name = product.value?.name ?? productIndexRows().find((r) => isProductBatchTracked(r.sku))?.name ?? ''
  const base = { description: '', expiry_date: '', manufacturing_date: '', best_before_date: '', supplier: '', grade: '' }
  return [
    { rowNumber: 2, productName: name, batchNumber: 'Batch #001', ...base, grade: 'A' },
    { rowNumber: 3, productName: name, batchNumber: 'Batch #999', ...base, grade: 'B' },
    { rowNumber: 4, productName: name, batchNumber: 'Batch #002', ...base, expiry_date: '2027-12-31' },
    { rowNumber: 5, productName: 'Unknown product', batchNumber: 'Batch #001', ...base },
    { rowNumber: 6, productName: name, batchNumber: 'Unassigned', ...base, grade: 'A' },
  ]
}

watch(scenario, (s) => {
  if (s === 'live') return void (result.value = null)
  if (s === 'success') return void successToast(t('Batches updated'))
  const checked = validateBatchUpdateRows(sampleRows())
  const failed = checked.map((c) => c.result).filter((r) => r.errors.length)
  // "All rows failed" leaves the valid sample rows out of the file.
  const total = s === 'failed' ? failed.length : checked.length
  result.value = { total, updated: total - failed.length, unchanged: 0, failed }
})
</script>

<template>
  <div class="ibu-page">
    <!-- ── Title bar ── -->
    <header class="ibu-bar">
      <div class="ibu-bar-left">
        <div class="ibu-breadcrumb-row">
          <MpTextlink id="ibu-crumb-products" as="a" class="ibu-breadcrumb" @click.prevent="router.push('/product-list')">{{ t('Products') }}</MpTextlink>
          <template v-if="product">
            <span class="ibu-breadcrumb-sep">/</span>
            <MpTextlink id="ibu-crumb-product" as="a" class="ibu-breadcrumb" @click.prevent="goBack">{{ product.name }}</MpTextlink>
          </template>
        </div>
        <h1 class="ibu-title">{{ t('Update batches') }}</h1>
      </div>
    </header>

    <div class="ibu-stage">
      <!-- ── Result: some or all rows weren't imported ── -->
      <div v-if="result" class="ibu-wrapper">
        <div class="ibu-summary" :class="{ 'ibu-summary--failed': !importedCount }">
          <MpIcon name="warning-triangle" size="md" :color="importedCount ? 'icon.warning' : 'icon.danger'" />
          <div class="ibu-summary-copy">
            <p class="ibu-summary-title">
              {{ importedCount
                ? t('{n} of {total} rows imported').replace('{n}', String(importedCount)).replace('{total}', String(result.total))
                : t('No rows imported') }}
            </p>
            <p class="ibu-summary-desc">
              {{ t('{n} rows weren’t imported. Fix them in the error file, then import that file again.').replace('{n}', String(result.failed.length)) }}
            </p>
          </div>
        </div>

        <div class="ibu-errors-scroll">
          <table class="ibu-errors">
            <thead>
              <tr>
                <th class="ibu-col-row">{{ t('ROW') }}</th>
                <th>{{ t('PRODUCT NAME') }}</th>
                <th>{{ t('BATCH NUMBER') }}</th>
                <th>{{ t('ERRORS') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in result.failed" :key="f.rowNumber">
                <td class="ibu-col-row">{{ f.rowNumber }}</td>
                <td>{{ f.productName || '-' }}</td>
                <td>{{ f.batchNumber || '-' }}</td>
                <td>
                  <ul class="ibu-error-list">
                    <li v-for="e in f.errors" :key="e">{{ importErrorText(e) }}</li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="ibu-actions">
          <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Close') }}</MpButton>
          <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="downloadErrorFile">{{ t('Download error file') }}</button>
          <MpButton variant="primary" is-rounded @click="importAgain">{{ t('Import again') }}</MpButton>
        </div>
      </div>

      <!-- ── Steps ── -->
      <div v-else class="ibu-wrapper">
        <p class="ibu-intro">{{ t('Follow these steps to update batch details and attributes from a spreadsheet.') }}</p>

        <div class="ibu-step">
          <span class="ibu-step-badge">1</span>
          <div class="ibu-step-body">
            <p class="ibu-step-title">{{ t('Download the template') }}</p>
            <p class="ibu-step-desc">
              {{ product
                ? t('The template lists this product’s batches with their current details, ready to edit.')
                : t('The template lists the batches of every batch-tracked product, ready to edit.') }}
            </p>
            <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="downloadTemplate">{{ t('Download template') }}</button>
            <FormatRequirementsAccordion :requirements="formatRequirements" />
          </div>
        </div>

        <div class="ibu-step">
          <span class="ibu-step-badge">2</span>
          <div class="ibu-step-body">
            <p class="ibu-step-title">{{ t('Upload your file') }}</p>
            <p class="ibu-step-desc">{{ t('Upload the completed template to update your batches.') }}</p>
            <ErpDropzone
              id="ibu-dropzone"
              accept=".csv,.xls,.xlsx"
              formats="CSV, XLS, and XLSX"
              max-size="10 MB"
              :is-multiple="false"
              :processing="processing"
              :files="file ? [file] : []"
              :is-invalid="!!uploadError"
              @change="onFileChange"
              @remove="removeFile"
            />
            <p v-if="uploadError" class="ibu-error">{{ uploadErrorText }}</p>
          </div>
        </div>

        <div class="ibu-actions">
          <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded :is-loading="processing" @click="doImport">{{ t('Import') }}</MpButton>
        </div>
      </div>
    </div>

    <ScenarioFab v-model="scenario" :scenarios="scenarios" />
  </div>
</template>

<style scoped>
/* ── Shell — same title bar + stage as the detail pages (docs/patterns/details-page-format.md §C) ── */
.ibu-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.ibu-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.ibu-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.ibu-breadcrumb-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ibu-breadcrumb {
  background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
  font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.ibu-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.ibu-breadcrumb-sep { font-size: 12px; color: var(--mp-text-secondary); }
.ibu-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.ibu-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 96px;
}
.ibu-wrapper { max-width: 640px; display: flex; flex-direction: column; gap: var(--mp-spacing-8); }

.ibu-intro { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }

/* ── Numbered step (mirrors ImportWarehousesPage / the cutover import) ── */
.ibu-step { display: flex; gap: var(--mp-spacing-3); align-items: flex-start; }
.ibu-step-badge {
  flex-shrink: 0; width: 24px; height: 24px; margin-top: 4px;
  border-radius: var(--mp-radii-full, 999px);
  display: flex; align-items: center; justify-content: center;
  background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm); font-variant-numeric: tabular-nums;
}
.ibu-step-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.ibu-step-body > .btn-enterprise { align-self: flex-start; }
.ibu-step-title {
  margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg); color: var(--mp-text-default);
}
.ibu-step-desc {
  margin: calc(var(--mp-spacing-2) * -1) 0 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
}
.ibu-error { margin: calc(var(--mp-spacing-1) * -1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.ibu-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); }

/* ── Result ── */
.ibu-summary {
  display: flex; gap: var(--mp-spacing-3); align-items: flex-start;
  padding: var(--mp-spacing-4); border-radius: var(--mp-radii-md, 6px);
  border: 1px solid var(--mp-border-warning, #f5c26b); background: var(--mp-background-warning-subtle, #fff8eb);
}
.ibu-summary--failed { border-color: var(--mp-border-danger, #f0a39d); background: var(--mp-background-danger-subtle, #fdf0ef); }
.ibu-summary-copy { display: flex; flex-direction: column; gap: 2px; }
.ibu-summary-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ibu-summary-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* A short, unpaginated list of the rows that failed — not an index table. */
.ibu-errors-scroll { overflow-x: auto; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px); }
.ibu-errors { width: 100%; border-collapse: collapse; font-size: var(--mp-font-sizes-md); }
.ibu-errors th {
  text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.ibu-errors td {
  padding: var(--mp-spacing-3); vertical-align: top; color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.ibu-errors tbody tr:last-child td { border-bottom: none; }
.ibu-col-row { width: 64px; font-variant-numeric: tabular-nums; }
.ibu-error-list { margin: 0; padding-left: var(--mp-spacing-4); list-style: disc outside; color: var(--mp-text-danger); }
.ibu-error-list li { display: list-item; }
</style>
