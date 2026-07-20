<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpTextarea, MpButton, MpIcon,
  MpDatePicker, MpTooltip, toast,
} from '@mekari/pixel3'
import { warehouses } from '~/data/warehouses'
import { addReceipt, nextReceiptNo } from '~/data/receipts'
import { VENDORS } from '~/data/master'
import { CATALOG } from '~/data/catalog'
import { scrollToFirstError } from '~/utils/form'

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

// ── Form state ─────────────────────────────────────────────────────────────
const vendor = ref('')
const vendorError = ref(false)
const isSaving = ref(false)
const isSavingAndAdding = ref(false)

const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)

const estimatedArrival = ref(todayDisplay)

const warehouseId = ref(activeWarehouse.value?.id ?? '')
const warehouseError = ref(false)

const transactionNo = ref('')
const shipVia = ref('')
const referenceNo = ref('')
const trackingNo = ref('')
const memo = ref('')

// ── Product line rows ─────────────────────────────────────────────────────
interface LineRow {
  id: number
  productId: string
  productName: string
  productSku: string
  productImg: string
  description: string
  qty: string
  unit: string
  qtyError: boolean
  productError: boolean
}

let rowSeq = 0
function makeRow(): LineRow {
  return { id: rowSeq++, productId: '', productName: '', productSku: '', productImg: '', description: '', qty: '1', unit: '', qtyError: false, productError: false }
}

const rows = ref<LineRow[]>([makeRow()])
const hasAnyProduct = computed(() => rows.value.some((r) => r.productId))

const ALL_PRODUCT_OPTIONS = CATALOG.map((p) => ({ id: p.id, name: p.name, desc: p.desc, unit: p.unit, img: p.img, sku: p.sku }))
const productFilter = ref('')
const productOptions = computed(() => {
  const q = productFilter.value.trim().toLowerCase()
  if (!q) return ALL_PRODUCT_OPTIONS
  return ALL_PRODUCT_OPTIONS.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
})
function onProductSearch(e: Event) {
  productFilter.value = (e.target as HTMLInputElement).value
}

function onProductSelect(row: LineRow, id: string) {
  row.productError = false
  productFilter.value = ''
  const p = CATALOG.find((c) => c.id === id)
  if (!p) { row.productName = ''; row.productSku = ''; row.productImg = ''; row.description = ''; row.unit = ''; return }
  row.productName = p.name
  row.productSku = p.sku
  row.productImg = p.img
  if (!row.description) row.description = p.desc
  row.unit = p.unit
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
function onDragEnd() { dragSrcIndex.value = null; dragOverIndex.value = null }

// ── Navigation ────────────────────────────────────────────────────────────
function goReceipts() {
  router.push({ path: '/inbound-delivery', query: { tab: 'Receipts' } })
}

// ── Validation + save ─────────────────────────────────────────────────────
async function validate(): Promise<boolean> {
  let valid = true
  if (!vendor.value) { vendorError.value = true; valid = false }
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!warehouseId.value) { warehouseError.value = true; valid = false }

  const filledRows = rows.value.filter((r) => r.productId)
  if (!filledRows.length) {
    rows.value.forEach((r) => { r.productError = true })
    valid = false
  } else {
    for (const row of filledRows) {
      if (!row.qty || Number(row.qty) < 1) { row.qtyError = true; valid = false }
      else row.qtyError = false
    }
  }
  if (!valid) { await nextTick(); scrollToFirstError() }
  return valid
}

function resetForm() {
  vendor.value = ''
  vendorError.value = false
  transactionDate.value = todayDisplay
  transactionDateError.value = false
  estimatedArrival.value = todayDisplay
  warehouseId.value = activeWarehouse.value?.id ?? ''
  warehouseError.value = false
  transactionNo.value = ''
  shipVia.value = ''
  referenceNo.value = ''
  trackingNo.value = ''
  memo.value = ''
  rows.value = [makeRow()]
  productFilter.value = ''
}

async function persist() {
  const filledRows = rows.value.filter((r) => r.productId)
  await new Promise(r => setTimeout(r, 600))
  const wh = warehouseOptions.value.find((w) => w.id === warehouseId.value)
  const skuQty = filledRows.length || 1
  const purchaseQty = filledRows.reduce((s, r) => s + (Number(r.qty) || 0), 0) || 1
  const txDate = toISODate(transactionDate.value)
  addReceipt({
    purchaseNo: transactionNo.value || nextReceiptNo(),
    warehouseId: warehouseId.value,
    warehouseName: wh?.name ?? '',
    skuQty,
    purchaseQty,
    receivedQty: 0,
    status: 'on the way',
    estimatedArrival: estimatedArrival.value ? toISODate(estimatedArrival.value) : txDate,
    vendor: vendor.value,
    trackingNos: trackingNo.value ? [trackingNo.value] : [],
    memo: memo.value.trim() || undefined,
    // The actual products/qty picked in the form above — without this, the
    // details page had no way to know what was really entered and fabricated
    // an unrelated random product mix from skuQty/purchaseQty alone.
    lineItems: filledRows.map((r) => ({ productId: r.productId, qty: Number(r.qty) || 1 })),
  })
}

async function handleSave() {
  if (!await validate()) return
  isSaving.value = true
  await persist()
  toast.notify({ variant: 'success', title: 'Receipt saved', maxWidth: 'max-content' })
  isSaving.value = false
  goReceipts()
}

async function handleSaveAndAdd() {
  if (!await validate()) return
  isSavingAndAdding.value = true
  await persist()
  toast.notify({ variant: 'success', title: 'Receipt saved', maxWidth: 'max-content' })
  isSavingAndAdding.value = false
  resetForm()
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

        <!-- ── Section / Header 1: Vendor ───────────────────────────────── -->
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
              <MpFormErrorMessage>You must select vendor</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </div>

        <!-- ── Section / Header 2: 3 columns ────────────────────────────── -->
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
              <MpFormErrorMessage>You must select transaction date</MpFormErrorMessage>
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
              <MpInput id="cr-refno-input" v-model="referenceNo" is-full-width />
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
              <MpInput id="cr-shipvia-input" v-model="shipVia" is-full-width />
            </MpFormControl>

            <div class="cr-field-spacer" />

            <MpFormControl id="cr-trackno">
              <MpFormLabel>Tracking no.</MpFormLabel>
              <MpInput id="cr-trackno-input" v-model="trackingNo" is-full-width />
            </MpFormControl>
          </div>

          <!-- Col 3: Warehouse -->
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
              <MpFormErrorMessage>You must select warehouse</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </div>

        <!-- ── Product table ──────────────────────────────────────────────── -->
        <div class="cr-table-section cr-table-section--bordered cr-table-section--gap-top">
          <div class="cr-table-scroll">
            <table class="cr-table">
              <colgroup>
                <col class="cr-col-drag" />
                <col class="cr-col-prod" />
                <col v-if="hasAnyProduct" class="cr-col-sku" />
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
                  <th v-if="hasAnyProduct" class="cr-th">SKU</th>
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
                  <td class="cr-td cr-td--drag">
                    <MpIcon name="drag" size="sm" />
                  </td>

                  <!-- Product -->
                  <td class="cr-td cr-td--input" :class="{ 'cr-td--prod-error': row.productError }">
                    <MpTooltip
                      v-if="row.productError"
                      :id="`cr-prod-tooltip-${row.id}`"
                      label="You must select product"
                      placement="top"
                      use-portal
                      class="cr-qty-tooltip-wrap"
                    >
                      <MpAutocomplete
                        :id="`cr-prod-${row.id}`"
                        v-model="row.productId"
                        :data="productOptions"
                        label-prop="name"
                        value-prop="id"
                        is-searchable is-clearable use-portal is-full-width is-manual-filter
                        @update:model-value="(v: string) => onProductSelect(row, v)"
                        @input="onProductSearch"
                      >
                        <template #leftAddon>
                          <img v-if="row.productImg" class="cr-prod-thumb" :src="row.productImg" :alt="row.productName" loading="lazy" />
                          <span v-else-if="row.productId" class="cr-prod-thumb cr-prod-thumb--empty" />
                        </template>
                        <template #default="{ item }">
                          <span class="cr-prod-option">
                            <img v-if="item.img" class="cr-prod-thumb" :src="item.img" :alt="item.name" loading="lazy" />
                            <span v-else class="cr-prod-thumb cr-prod-thumb--empty" />
                            <span class="cr-prod-info">
                              <span class="cr-prod-name">{{ item.name }}</span>
                              <span class="cr-prod-sku">{{ item.sku }}</span>
                            </span>
                          </span>
                        </template>
                      </MpAutocomplete>
                    </MpTooltip>
                    <MpAutocomplete
                      v-else
                      :id="`cr-prod-${row.id}`"
                      v-model="row.productId"
                      :data="productOptions"
                      label-prop="name"
                      value-prop="id"
                      is-searchable is-clearable use-portal is-full-width is-manual-filter
                      @update:model-value="(v: string) => onProductSelect(row, v)"
                      @input="onProductSearch"
                    >
                      <template #leftAddon>
                        <img v-if="row.productImg" class="cr-prod-thumb" :src="row.productImg" :alt="row.productName" loading="lazy" />
                        <span v-else-if="row.productId" class="cr-prod-thumb cr-prod-thumb--empty" />
                      </template>
                      <template #default="{ item }">
                        <span class="cr-prod-option">
                          <img v-if="item.img" class="cr-prod-thumb" :src="item.img" :alt="item.name" loading="lazy" />
                          <span v-else class="cr-prod-thumb cr-prod-thumb--empty" />
                          <span class="cr-prod-info">
                            <span class="cr-prod-name">{{ item.name }}</span>
                            <span class="cr-prod-sku">{{ item.sku }}</span>
                          </span>
                        </span>
                      </template>
                    </MpAutocomplete>
                  </td>

                  <!-- Row has product: SKU + all input cols -->
                  <template v-if="row.productId">
                    <td class="cr-td cr-td--sku">{{ row.productSku }}</td>
                    <td class="cr-td cr-td--input">
                      <MpInput :id="`cr-desc-${row.id}`" v-model="row.description" is-full-width />
                    </td>
                    <td class="cr-td cr-td--input cr-td--qty-cell" :class="{ 'cr-td--qty-error': row.qtyError }">
                      <MpTooltip
                        v-if="row.qtyError"
                        :id="`cr-qty-tooltip-${row.id}`"
                        label="Qty must be at least 1"
                        placement="top"
                        use-portal
                        class="cr-qty-tooltip-wrap"
                      >
                        <MpInput
                          :id="`cr-qty-${row.id}`"
                          v-model="row.qty"
                          type="number"
                          is-full-width
                          @update:model-value="row.qtyError = false"
                        />
                      </MpTooltip>
                      <MpInput
                        v-else
                        :id="`cr-qty-${row.id}`"
                        v-model="row.qty"
                        type="number"
                        is-full-width
                        @update:model-value="row.qtyError = false"
                      />
                    </td>
                    <td class="cr-td cr-td--unit">{{ row.unit }}</td>
                  </template>

                  <!-- Row has no product: empty cell spanning remaining cols -->
                  <td v-else :colspan="hasAnyProduct ? 4 : 1" class="cr-td" />

                  <!-- Delete — only shown on rows that have a product -->
                  <td class="cr-td cr-td--del">
                    <button v-if="row.productId" class="cr-del-btn" type="button" @click="removeRow(row.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── Memo ───────────────────────────────────────────────────────── -->
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

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goReceipts">Cancel</MpButton>
      <button class="cr-btn-secondary" :disabled="isSaving || isSavingAndAdding" @click="handleSaveAndAdd">{{ isSavingAndAdding ? 'Saving…' : 'Save & add another' }}</button>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving || isSavingAndAdding" @click="handleSave">{{ isSaving ? 'Saving…' : 'Save' }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
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

.cr-btn-secondary {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-radius: var(--mp-radii-full, 999px);
  border: 1px solid var(--mp-border-bold);
  background: var(--mp-background-neutral);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; white-space: nowrap;
}
.cr-btn-secondary:hover:not(:disabled) { background: var(--mp-background-neutral-hovered); }
.cr-btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }

.cr-body { display: flex; flex-direction: column; }

.cr-header-1 {
  display: flex; gap: 24px;
  padding-bottom: 20px;
  border-bottom: 1px dashed var(--mp-border-default);
}
.cr-header-1-col { width: 318px; flex-shrink: 0; }
.cr-field-flex { flex: 1 0 0; min-width: 0; }

.cr-header-2 { display: flex; gap: 24px; padding: 20px 0; }
.cr-col { width: 318px; flex-shrink: 0; display: flex; flex-direction: column; }
.cr-field-spacer { height: 16px; flex-shrink: 0; }

.cr-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cr-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }

.cr-datepicker { width: 100%; }
.cr-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.cr-table-section--gap-top { margin-top: 32px; }
.cr-table-section { overflow-x: auto; }
.cr-table-section--bordered { border-bottom: 1px solid var(--mp-border-default); }
.cr-table tbody tr:last-child .cr-td { border-bottom: none; }
.cr-table-scroll { overflow-x: auto; }
.cr-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }

.cr-col-drag { width: 40px; }
.cr-col-prod { width: 360px; }
.cr-col-qty  { width: 140px; }
.cr-col-unit { width: 160px; }
.cr-col-del  { width: 48px; }
.cr-col-sku  { width: 160px; }

.cr-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.cr-th--drag { padding: 0; }
.cr-th--del  { padding: 0; }

.cr-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
.cr-td:last-child { border-right: none; }

.cr-tr--dragging { opacity: 0.4; }
.cr-tr--dragover > .cr-td { border-top: 2px solid var(--mp-border-focused, #2563eb); }

.cr-td--drag { padding: 0; text-align: center; vertical-align: middle; color: var(--mp-text-placeholder); cursor: grab; }
.cr-tr--dragging .cr-td--drag { cursor: grabbing; }

.cr-td--input { padding: 0; vertical-align: middle; }
.cr-td--input :deep([class*='input']),
.cr-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.cr-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }

/* Unit — read-only gray cell */
.cr-td--unit { background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); }

/* SKU — read-only gray cell */
.cr-td--sku { color: var(--mp-text-secondary); white-space: nowrap; background: var(--mp-background-neutral-subtle); }

/* Qty error state */
.cr-td--qty-cell { padding: 0; vertical-align: middle; }
.cr-td--qty-cell :deep([class*='input']) { border-radius: 0; border-color: transparent; }
.cr-td--qty-cell:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.cr-td--qty-error { background: #FCEEED; border-bottom-color: #E2483D; }
.cr-td--qty-error :deep([class*='input']) { background: transparent; }

/* Product error state */
.cr-td--prod-error { background: #FCEEED; border-bottom-color: #E2483D; }
.cr-td--prod-error :deep([class*='autocomplete']),
.cr-td--prod-error :deep([class*='input']) { background: transparent; }

/* Tooltip wrapper fills its cell */
.cr-qty-tooltip-wrap { display: block; width: 100%; }
.cr-qty-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

.cr-td--del { padding: 0; text-align: center; vertical-align: middle; }

.cr-del-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border: none; background: none; border-radius: var(--mp-radii-sm);
  cursor: pointer; color: var(--mp-text-secondary);
  transition: background 0.1s, color 0.1s;
}
.cr-del-btn:hover:not(:disabled) { background: var(--mp-background-neutral); color: var(--mp-text-danger, #dc2626); }
.cr-del-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.cr-prod-option { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 100%; }
.cr-prod-thumb {
  width: 28px; height: 28px; border-radius: var(--mp-radii-md); flex-shrink: 0;
  object-fit: cover; border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral);
}
.cr-prod-thumb--empty { background: var(--mp-background-neutral-subtle); }
.cr-prod-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cr-prod-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-prod-sku  { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cr-section {
  display: flex; flex-direction: column;
  gap: var(--mp-spacing-2);
  max-width: 440px;
  padding: var(--mp-spacing-6) 0;
}
.cr-section--gap-top { padding-top: 32px; padding-bottom: 0; }
.cr-helper-text {
  margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm);
}
</style>
