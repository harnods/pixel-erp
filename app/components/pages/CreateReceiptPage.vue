<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpTextarea, MpButton, MpIcon,
  MpInputTag, MpDatePicker, toast,
  type DataInterface,
} from '@mekari/pixel3'
import { warehouses } from '~/data/warehouses'
import { addReceipt } from '~/data/receipts'
import { VENDORS } from '~/data/master'
import { CATALOG } from '~/data/catalog'

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}

const router = useRouter()

// ── Warehouse options ──────────────────────────────────────────────────────
const warehouseOptions = computed(() =>
  warehouses
    .filter((w) => !w.isDefault && w.status === 'active')
    .map((w) => ({ id: w.id, name: w.name })),
)

const { activeWarehouse } = useWarehouseContext()

// ── Vendor options ────────────────────────────────────────────────────────
const vendorOptions = ref(VENDORS.map((v) => ({ id: v, name: v })))

function onVendorAdd(_suggestions: unknown, currentSearch: string) {
  const name = currentSearch.trim()
  if (!name) return
  if (!vendorOptions.value.some((v) => v.id === name)) {
    vendorOptions.value.push({ id: name, name })
  }
  vendor.value = name
  vendorError.value = false
}

// ── Unit options (derived from catalog) ──────────────────────────────────
const UNIT_OPTIONS = [...new Set(CATALOG.map((p) => p.unit))].map((u) => ({ id: u, name: u }))

// ── Form state ─────────────────────────────────────────────────────────────
const vendor = ref('')
const vendorError = ref(false)


const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)

const estimatedArrival = ref(todayDisplay)

const warehouseId = ref(activeWarehouse.value?.id ?? '')
const warehouseError = ref(false)

const transactionNo = ref('')

const shipVia = ref('')
const tags = ref<DataInterface[]>([])

const referenceNo = ref('')
const trackingNo = ref('')

const memo = ref('')

// ── Product line rows ─────────────────────────────────────────────────────
interface LineRow {
  id: number
  productId: string
  productName: string
  description: string
  qty: string
  unit: string
  qtyError: boolean
}

let rowSeq = 0
function makeRow(): LineRow {
  return { id: rowSeq++, productId: '', productName: '', description: '', qty: '1', unit: '', qtyError: false }
}

const rows = ref<LineRow[]>([makeRow()])
const hasAnyProduct = computed(() => rows.value.some((r) => r.productId))

const productOptions = CATALOG.map((p) => ({ id: p.id, name: p.name, desc: p.desc, unit: p.unit }))

function onProductSelect(row: LineRow, id: string) {
  const p = CATALOG.find((c) => c.id === id)
  if (!p) { row.productName = ''; row.description = ''; row.unit = ''; return }
  row.productName = p.name
  if (!row.description) row.description = p.desc
  if (!row.unit) row.unit = p.unit
  // Auto-append a new empty row when the last row gets a product
  const last = rows.value[rows.value.length - 1]
  if (last && last.id === row.id) rows.value.push(makeRow())
}

function removeRow(id: number) {
  if (rows.value.length === 1) return
  rows.value = rows.value.filter((r) => r.id !== id)
}

// ── Drag-and-drop row reorder ─────────────────────────────────────────────
const dragSrcIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(ev: DragEvent, idx: number) {
  dragSrcIndex.value = idx
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move'
    ev.dataTransfer.setData('text/plain', String(idx))
  }
}

function onDragOver(ev: DragEvent, idx: number) {
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}

function onDrop(ev: DragEvent, toIdx: number) {
  ev.preventDefault()
  const fromIdx = dragSrcIndex.value
  if (fromIdx === null || fromIdx === toIdx) { dragSrcIndex.value = null; dragOverIndex.value = null; return }
  const arr = [...rows.value]
  const [moved] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, moved!)
  rows.value = arr
  dragSrcIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragSrcIndex.value = null
  dragOverIndex.value = null
}

// ── Tag input (MpInputTag) ────────────────────────────────────────────────
function onTagsChange(data: DataInterface[]) { tags.value = data }

// ── Attachment ────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])

function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) {
    for (const f of Array.from(input.files)) {
      if (!attachedFiles.value.some((x) => x.name === f.name)) attachedFiles.value.push(f)
    }
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter((f) => f.name !== name) }

// ── Navigation ────────────────────────────────────────────────────────────
function goReceipts() {
  router.push({ path: '/inbound-delivery', query: { tab: 'Receipts' } })
}

// ── Save ──────────────────────────────────────────────────────────────────
function handleSave() {
  let valid = true
  if (!vendor.value) { vendorError.value = true; valid = false }
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!warehouseId.value) { warehouseError.value = true; valid = false }

  const filledRows = rows.value.filter((r) => r.productId)
  for (const row of filledRows) {
    if (!row.qty || Number(row.qty) < 1) { row.qtyError = true; valid = false }
    else row.qtyError = false
  }
  if (!valid) return

  const wh = warehouseOptions.value.find((w) => w.id === warehouseId.value)
  const skuQty = filledRows.length || 1
  const purchaseQty = filledRows.reduce((s, r) => s + (Number(r.qty) || 0), 0) || 1

  addReceipt({
    purchaseNo: transactionNo.value || `RCV-${toISODate(transactionDate.value).replace(/-/g, '')}-001`,
    warehouseId: warehouseId.value,
    warehouseName: wh?.name ?? '',
    skuQty,
    purchaseQty,
    receivedQty: 0,
    status: 'on the way',
    estimatedArrival: estimatedArrival.value ? toISODate(estimatedArrival.value) : '',
    vendor: vendor.value,
    trackingNos: trackingNo.value ? [trackingNo.value] : [],
    memo: memo.value.trim() || undefined,
  })

  toast.notify({ variant: 'success', title: 'Receipt created successfully' })
  goReceipts()
}

// ── Sticky footer ─────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
  })
})
onUnmounted(() => { stageObserver?.disconnect() })
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goReceipts">Inbound delivery</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New receipt</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">
      <div class="cr-body">

        <!-- ── Section / Header 1: Vendor + Email ───────────────────── -->
        <div class="cr-header-1">
          <div class="cr-header-1-col">
            <MpFormControl id="cr-vendor" class="cr-field-flex" is-required :is-invalid="vendorError">
              <MpFormLabel>Vendor</MpFormLabel>
              <MpAutocomplete
                id="cr-vendor-ac"
                v-model="vendor"
                :data="vendorOptions"
                label-prop="name"
                value-prop="id"
                is-searchable is-clearable use-portal is-full-width
                is-show-button-action
                :is-invalid="vendorError"
                @update:model-value="vendorError = false"
                @button-action="onVendorAdd"
              >
                <template #buttonAction="{ currentSearch }">
                  {{ currentSearch ? `Add "${currentSearch}" as a new vendor` : 'Add new vendor' }}
                </template>
              </MpAutocomplete>
              <MpFormErrorMessage>Please select a vendor</MpFormErrorMessage>
            </MpFormControl>

          </div>
        </div>

        <!-- ── Section / Header 2: 3 vertical columns ────────────────── -->
        <div class="cr-header-2">
          <!-- Col 1: Transaction date → Transaction no. → Reference no. -->
          <div class="cr-col">
            <MpFormControl id="cr-txdate" is-required :is-invalid="transactionDateError">
              <MpFormLabel>Transaction date</MpFormLabel>
              <div class="cr-datepicker">
                <MpDatePicker
                  id="cr-txdate-dp"
                  v-model="transactionDate"
                  format="DD/MM/YYYY"
                  value-type="format"
                  use-portal
                  @update:model-value="transactionDateError = false"
                />
              </div>
              <MpFormErrorMessage>Please enter a transaction date</MpFormErrorMessage>
            </MpFormControl>

            <div class="cr-field-spacer" />

            <MpFormControl id="cr-transno">
              <div class="cr-label-row">
                <MpFormLabel>Transaction no.</MpFormLabel>
                <span class="cr-label-icon" title="Auto-generated">
                  <MpIcon name="settings" size="sm" />
                </span>
              </div>
              <MpInput
                id="cr-transno-input"
                v-model="transactionNo"
                placeholder="[AUTO]"
                is-full-width
                is-disabled
              />
            </MpFormControl>

            <div class="cr-field-spacer" />

            <MpFormControl id="cr-refno">
              <MpFormLabel>Reference no.</MpFormLabel>
              <MpInput
                id="cr-refno-input"
                v-model="referenceNo"
                is-full-width
              />
            </MpFormControl>
          </div>

          <!-- Col 2: Estimated arrival → Ship via → Tracking no. -->
          <div class="cr-col">
            <MpFormControl id="cr-arrival">
              <MpFormLabel>Estimated arrival date</MpFormLabel>
              <div class="cr-datepicker">
                <MpDatePicker
                  id="cr-arrival-dp"
                  v-model="estimatedArrival"
                  format="DD/MM/YYYY"
                  value-type="format"
                  is-clearable
                  use-portal
                />
              </div>
            </MpFormControl>

            <div class="cr-field-spacer" />

            <MpFormControl id="cr-shipvia">
              <MpFormLabel>Ship via</MpFormLabel>
              <MpInput
                id="cr-shipvia-input"
                v-model="shipVia"
                is-full-width
              />
            </MpFormControl>

            <div class="cr-field-spacer" />

            <MpFormControl id="cr-trackno">
              <MpFormLabel>Tracking no.</MpFormLabel>
              <MpInput
                id="cr-trackno-input"
                v-model="trackingNo"
                is-full-width
              />
            </MpFormControl>
          </div>

          <!-- Col 3: Warehouse → Tags -->
          <div class="cr-col">
            <MpFormControl id="cr-warehouse" is-required :is-invalid="warehouseError">
              <MpFormLabel>Warehouse</MpFormLabel>
              <MpAutocomplete
                id="cr-warehouse-ac"
                v-model="warehouseId"
                :data="warehouseOptions"
                label-prop="name"
                value-prop="id"
                is-searchable is-clearable use-portal is-full-width
                :is-invalid="warehouseError"
                @update:model-value="warehouseError = false"
              />
              <MpFormErrorMessage>Please select a warehouse</MpFormErrorMessage>
            </MpFormControl>

            <div class="cr-field-spacer" />

            <MpFormControl id="cr-tags">
              <MpFormLabel>Tags</MpFormLabel>
              <MpInputTag
                id="cr-tags-input"
                :data="tags"
                :is-enable-create-new-tag="true"
                :is-show-suggestions="false"
                @change="onTagsChange"
              />
            </MpFormControl>
          </div>
        </div>

        <!-- ── Product table ──────────────────────────────────────────── -->
        <div class="cr-table-section cr-table-section--bordered cr-table-section--gap-top">
          <div class="cr-table-scroll">
            <table class="cr-table">
              <colgroup>
                <col class="cr-col-drag" />
                <col class="cr-col-prod" />
                <col v-if="!hasAnyProduct" />
                <col v-if="hasAnyProduct" />
                <col v-if="hasAnyProduct" class="cr-col-qty" />
                <col v-if="hasAnyProduct" class="cr-col-unit" />
                <col class="cr-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="cr-th cr-th--drag" />
                  <th class="cr-th">Product</th>
                  <th v-if="!hasAnyProduct" class="cr-th" />
                  <th v-if="hasAnyProduct" class="cr-th">Description</th>
                  <th v-if="hasAnyProduct" class="cr-th">Qty</th>
                  <th v-if="hasAnyProduct" class="cr-th">Unit</th>
                  <th class="cr-th cr-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, idx) in rows"
                  :key="row.id"
                  class="cr-tr"
                  :class="{
                    'cr-tr--dragging': dragSrcIndex === idx,
                    'cr-tr--dragover': dragOverIndex === idx && dragSrcIndex !== idx,
                  }"
                  draggable="true"
                  @dragstart="onDragStart($event, idx)"
                  @dragover="onDragOver($event, idx)"
                  @drop="onDrop($event, idx)"
                  @dragend="onDragEnd"
                >
                  <!-- Drag handle -->
                  <td class="cr-td cr-td--drag">
                    <MpIcon name="drag" size="sm" />
                  </td>

                  <!-- Product -->
                  <td class="cr-td cr-td--input">
                    <MpAutocomplete
                      :id="`cr-prod-${row.id}`"
                      v-model="row.productId"
                      :data="productOptions"
                      label-prop="name"
                      value-prop="id"
                      is-searchable is-clearable use-portal is-full-width
                      @update:model-value="(v: string) => onProductSelect(row, v)"
                    />
                  </td>

                  <!-- Spacer (fills remaining width when no other columns) -->
                  <td v-if="!hasAnyProduct" class="cr-td" />

                  <!-- Description -->
                  <td v-if="hasAnyProduct" class="cr-td cr-td--input">
                    <MpInput
                      :id="`cr-desc-${row.id}`"
                      v-model="row.description"
                      is-full-width
                    />
                  </td>

                  <!-- Qty -->
                  <td v-if="hasAnyProduct" class="cr-td cr-td--input">
                    <MpInput
                      :id="`cr-qty-${row.id}`"
                      v-model="row.qty"
                      type="number"
                      is-full-width
                      :is-invalid="row.qtyError"
                      @update:model-value="row.qtyError = false"
                    />
                  </td>

                  <!-- Unit -->
                  <td v-if="hasAnyProduct" class="cr-td cr-td--input">
                    <MpAutocomplete
                      :id="`cr-unit-${row.id}`"
                      v-model="row.unit"
                      :data="UNIT_OPTIONS"
                      label-prop="name"
                      value-prop="id"
                      is-searchable use-portal is-full-width
                    />
                  </td>

                  <!-- Delete -->
                  <td class="cr-td cr-td--del">
                    <button
                      v-if="!(rows.length === 1 && !row.productId)"
                      class="cr-del-btn"
                      type="button"
                      @click="removeRow(row.id)"
                    >
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── Memo ───────────────────────────────────────────────────── -->
        <div class="cr-section cr-section--gap-top">
          <MpFormControl id="cr-memo">
            <MpFormLabel>Memo</MpFormLabel>
            <MpTextarea
              id="cr-memo-textarea"
              v-model="memo"
              is-full-width
              :rows="4"
            />
          </MpFormControl>
          <p class="cr-helper-text">Only visible to you and your team</p>
        </div>

        <!-- ── Attachment ─────────────────────────────────────────────── -->
        <div class="cr-section cr-section--last">
          <div class="cr-section-label">Attachment</div>
          <div class="cr-attachment">
            <input
              ref="fileInput"
              type="file"
              multiple
              accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
              class="cr-file-hidden"
              @change="onFileChange"
            />
            <div class="cr-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">
                Choose file
              </MpButton>
              <span class="cr-attach-or">or drag and drop here</span>
            </div>
            <p class="cr-helper-text">Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
            <ul v-if="attachedFiles.length" class="cr-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="cr-file-item">
                <span class="cr-file-name">{{ f.name }}</span>
                <button class="cr-file-remove" type="button" @click="removeFile(f.name)">
                  <MpIcon name="close" size="xs" />
                </button>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goReceipts">Cancel</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">Save</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}

.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
  transition: border-top-color 0.15s;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Body ────────────────────────────────────────────────────────────────── */
.cr-body { display: flex; flex-direction: column; }

/* ── Section / Header 1: Vendor + Email ─────────────────────────────────── */
.cr-header-1 {
  display: flex;
  gap: 24px;
  padding-bottom: 20px;
  border-bottom: 1px dashed var(--mp-border-default);
}
.cr-header-1-col {
  width: 318px;
  flex-shrink: 0;
}
/* Each field inside header-1 stretches equally */
.cr-field-flex { flex: 1 0 0; min-width: 0; }

/* ── Section / Header 2: 3 vertical columns ─────────────────────────────── */
.cr-header-2 {
  display: flex;
  gap: 24px;
  padding: 20px 0;
}
/* Each column is 318px wide, fields stacked vertically */
.cr-col {
  width: 318px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
/* 16px spacer between fields — matches Figma Spacer nodes */
.cr-field-spacer { height: 16px; flex-shrink: 0; }

/* ── Label row with icon ─────────────────────────────────────────────────── */
.cr-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cr-label-icon {
  display: flex; align-items: center;
  color: var(--mp-text-secondary);
  cursor: pointer;
}

/* ── Datepicker full-width wrapper ───────────────────────────────────────── */
.cr-datepicker { width: 100%; }
.cr-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* ── Table top gap ───────────────────────────────────────────────────────── */
.cr-table-section--gap-top { margin-top: 32px; }

/* ── Table ───────────────────────────────────────────────────────────────── */
.cr-table-section { overflow-x: auto; }
/* Bottom border flush with last row — no gap */
.cr-table-section--bordered { border-bottom: 1px solid var(--mp-border-default); }
.cr-table-scroll { overflow-x: auto; }
.cr-table {
  width: 100%; table-layout: fixed;
  border-collapse: collapse; border-spacing: 0;
}

.cr-col-drag { width: 40px; }
.cr-col-prod { width: 280px; }
.cr-col-qty  { width: 140px; }
.cr-col-unit { width: 160px; }
.cr-col-del  { width: 48px; }
/* description col has no explicit width → fills remaining space in fixed layout */

/* Header — matches the pi-th / pr-th canonical pattern */
.cr-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.cr-th--drag { padding: 0; }
.cr-th--del  { padding: 0; }

/* Body cells */
.cr-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}

/* Drag row states */
.cr-tr--dragging { opacity: 0.4; }
.cr-tr--dragover > .cr-td { border-top: 2px solid var(--mp-border-focused, #2563eb); }

/* Drag handle cell */
.cr-td--drag {
  padding: 0;
  text-align: center; vertical-align: middle;
  color: var(--mp-text-placeholder);
  cursor: grab;
}
.cr-tr--dragging .cr-td--drag { cursor: grabbing; }

/* Input cells — padding 0 so Pixel3 control fills edge-to-edge */
.cr-td--input { padding: 0; vertical-align: middle; }
/* Strip the Pixel3 control's own border/radius so it merges with the cell grid */
.cr-td--input :deep([class*='input']),
.cr-td--input :deep([class*='autocomplete']) {
  border-radius: 0;
  border-color: transparent;
}
.cr-td--input:focus-within {
  box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb);
}

/* Delete cell */
.cr-td--del {
  padding: 0;
  text-align: center; vertical-align: middle;
}

/* ── Delete row button ───────────────────────────────────────────────────── */
.cr-del-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border: none; background: none; border-radius: var(--mp-radii-sm);
  cursor: pointer; color: var(--mp-text-secondary);
  transition: background 0.1s, color 0.1s;
}
.cr-del-btn:hover:not(:disabled) {
  background: var(--mp-background-neutral);
  color: var(--mp-text-danger, #dc2626);
}
.cr-del-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── Memo + Attachment sections ──────────────────────────────────────────── */
.cr-section {
  display: flex; flex-direction: column;
  gap: var(--mp-spacing-2);
  max-width: 440px;
  padding: var(--mp-spacing-6) 0;
}
/* memo: gap-top handles padding-top (32px); remove bottom padding so gap to attachment = 20px */
.cr-section--gap-top { padding-top: 32px; padding-bottom: 0; }
.cr-section--last { padding-top: 20px; }
.cr-section-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  margin-bottom: var(--mp-spacing-1);
}
.cr-helper-text {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm);
}

/* ── Attachment ──────────────────────────────────────────────────────────── */
.cr-file-hidden { display: none; }
.cr-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cr-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cr-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cr-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.cr-file-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
}
.cr-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-file-remove {
  display: flex; align-items: center;
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--mp-text-secondary);
}
.cr-file-remove:hover { color: var(--mp-text-default); }
</style>
