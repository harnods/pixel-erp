<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpTextarea, MpButton, MpIcon, MpInputTag, MpDatePicker,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  toast, css, type DataInterface,
} from '@mekari/pixel3'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer from '~/components/patterns/ManageSerialDrawer.vue'
import { warehouses } from '~/data/warehouses'
import { productBySku, PRODUCTS } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { addAdjustment, accountOptions, IN_OUT_CATEGORIES } from '~/data/stockAdjustments'

const router = useRouter()

function toDisplayDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toISODate(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ── Warehouse + account + category options ──────────────────────────────────────
const warehouseOptions = computed(() => warehouses.filter(w => w.status === 'active').map(w => ({ id: w.id, name: w.name })))
const realWarehouses = warehouses.filter(w => w.status === 'active' && !w.isDefault)
function warehouseName(id: string) { return warehouseOptions.value.find(w => w.id === id)?.name ?? '' }
const acctOptions = accountOptions()
const categoryOptions = IN_OUT_CATEGORIES.map(c => ({ id: c, name: c }))

// ── Form state ───────────────────────────────────────────────────────────────────
const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)
const warehouseId = ref(realWarehouses[0]?.id ?? warehouseOptions.value[0]?.id ?? '')
const warehouseError = ref(false)
const categoryId = ref(IN_OUT_CATEGORIES[0])
const categoryError = ref(false)
const accountId = ref(acctOptions.find(a => a.id === 'Inventory adjustment')?.id ?? acctOptions[0]?.id ?? '')
const tags = ref<DataInterface[]>([])
const memo = ref('')

// ── Warehouse stock (system on-hand, coherent with the warehouse detail page) ──────
const stock = computed(() => (warehouseId.value ? getWarehouseDetail(warehouseId.value)?.stock ?? [] : []))
const stockMap = computed(() => new Map(stock.value.map(s => [s.sku, s])))
function onHandFor(sku: string): number { return stockMap.value.get(sku)?.onHand ?? 0 }
function unitFor(sku: string): string { return stockMap.value.get(sku)?.unit ?? productBySku(sku)?.unit ?? '' }
function avgCostFor(sku: string): number { return productBySku(sku)?.averageCost ?? 0 }
function nameFor(sku: string): string { return stockMap.value.get(sku)?.name ?? productBySku(sku)?.name ?? sku }
function imgFor(sku: string): string | undefined { return productBySku(sku)?.img }
function descFor(sku: string): string | undefined { return productBySku(sku)?.desc }

// Products offered in the picker — the full product catalog (PRODUCTS). On-hand for
// a chosen product comes from this warehouse's stock (0 if it doesn't stock it yet).
const pickerProducts = computed<PickerProduct[]>(() =>
  PRODUCTS.map(p => ({ sku: p.sku, name: p.name, img: p.img, desc: p.desc })),
)

// ── Batch-tracking helpers ────────────────────────────────────────────────────────
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans'])
function isBatchTrackedSku(sku: string): boolean {
  const si = stockMap.value.get(sku)
  if (si) return (si.batches?.length ?? 0) > 0
  const p = productBySku(sku)
  return p ? BATCH_CATS.has(p.category) : false
}

const SERIAL_CATS = new Set(['Espresso Machine', 'Grinder', 'Equipment'])
function isSerialTrackedSku(sku: string): boolean {
  const si = stockMap.value.get(sku)
  if (si) return !!si.serials
  const p = productBySku(sku)
  return p ? SERIAL_CATS.has(p.category) : false
}

// ── Product rows (each an in/out product) ──────────────────────────────────────────
interface InOutRow { sku: string; delta: string; deltaError: boolean; avgMode: 'auto' | 'custom'; avgCostInput: string; batchLines?: CommittedBatch[]; serialLines?: string[] }
const rows = ref<InOutRow[]>([])
const selectedSkus = computed(() => rows.value.map(r => r.sku))

const drawerOpen = ref(false)
const batchDrawerRow = ref<InOutRow | null>(null)
const batchDrawerOpen = computed({
  get: () => batchDrawerRow.value !== null,
  set: (v) => { if (!v) batchDrawerRow.value = null }
})
function openBatchDrawer(row: InOutRow) { batchDrawerRow.value = row }
function saveBatchLines(batches: CommittedBatch[]) {
  if (!batchDrawerRow.value) return
  batchDrawerRow.value.batchLines = batches
}
function batchHasCounts(row: InOutRow): boolean {
  return (row.batchLines ?? []).some(b => b.counted !== null)
}
function batchTotalFor(row: InOutRow): number {
  return (row.batchLines ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}

const serialDrawerRow = ref<InOutRow | null>(null)
const serialDrawerOpen = computed({
  get: () => serialDrawerRow.value !== null,
  set: (v) => { if (!v) serialDrawerRow.value = null }
})
function openSerialDrawer(row: InOutRow) { serialDrawerRow.value = row }
function saveSerialLines(serials: string[]) {
  if (!serialDrawerRow.value) return
  serialDrawerRow.value.serialLines = serials
}
function serialHasCounts(row: InOutRow): boolean {
  return (row.serialLines?.length ?? 0) > 0
}
function serialTotalFor(row: InOutRow): number {
  return row.serialLines?.length ?? 0
}

function applyPicker(skus: string[]) {
  const existing = new Map(rows.value.map(r => [r.sku, r]))
  rows.value = skus.map(sku => existing.get(sku) ?? { sku, delta: '', deltaError: false, avgMode: 'auto', avgCostInput: '' })
}
function removeRow(sku: string) { rows.value = rows.value.filter(r => r.sku !== sku) }

// ── Delta input (allows negative for stock out) ──────────────────────────────────
function onDeltaInput(row: InOutRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const raw = input.value
  const isNeg = raw.startsWith('-')
  const digits = raw.replace(/[^0-9]/g, '')
  const formatted = digits
    ? (isNeg ? '-' : '') + Number(digits).toLocaleString('id-ID')
    : (isNeg ? '-' : '')
  row.delta = formatted
  row.deltaError = false
  nextTick(() => { input.setSelectionRange(input.value.length, input.value.length) })
}

function parseDelta(val: string): number {
  const isNeg = val.trim().startsWith('-')
  const abs = Number(val.replace(/[^0-9]/g, '')) || 0
  return isNeg ? -abs : abs
}

function hasMovement(row: InOutRow): boolean {
  if (isBatchTrackedSku(row.sku)) return batchHasCounts(row)
  return row.delta.trim() !== '' && row.delta.trim() !== '-'
}

function newOnHandFor(row: InOutRow): number | null {
  if (isBatchTrackedSku(row.sku)) {
    if (!batchHasCounts(row)) return null
    return onHandFor(row.sku) + batchTotalFor(row)
  }
  if (!hasMovement(row)) return null
  return onHandFor(row.sku) + parseDelta(row.delta)
}

// Average cost per row
function onAvgInput(row: InOutRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  row.avgCostInput = digits ? Number(digits).toLocaleString('id-ID') : ''
  nextTick(() => { input.setSelectionRange(input.value.length, input.value.length) })
}
function setAvgMode(row: InOutRow, mode: 'auto' | 'custom') {
  row.avgMode = mode
  if (mode === 'custom' && row.avgCostInput === '') {
    const cost = avgCostFor(row.sku)
    row.avgCostInput = cost > 0 ? cost.toLocaleString('id-ID') : ''
  }
}
function fmtIDR(n: number) { return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }) }

// ── Search filter ────────────────────────────────────────────────────────────────
const search = ref('')
const displayRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter(r => {
    if (q && !nameFor(r.sku).toLowerCase().includes(q) && !r.sku.toLowerCase().includes(q)) return false
    return true
  })
})
function importProducts() { /* bulk import — not built in this prototype */ }

// ── Tags ─────────────────────────────────────────────────────────────────────────
function onTagsChange(data: DataInterface[]) { tags.value = data }
function tagStrings(): string[] { return tags.value.map(t => String(t.text ?? t.value ?? '')).map(s => s.trim()).filter(Boolean) }

// ── Attachment ─────────────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])
function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) for (const f of Array.from(input.files)) {
    if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter(f => f.name !== name) }

// ── Navigation + save ──────────────────────────────────────────────────────────────
function goBack() { router.push('/stock-adjustments') }
const formError = ref('')
function handleSave() {
  formError.value = ''
  let valid = true
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (!categoryId.value) { categoryError.value = true; valid = false }
  if (!rows.value.length) { formError.value = 'Add at least one product.'; valid = false }
  if (!valid) return

  const lines = rows.value.map(r => ({
    sku: r.sku,
    qty: isBatchTrackedSku(r.sku)
      ? (batchHasCounts(r) ? batchTotalFor(r) : 0)
      : parseDelta(r.delta),
  }))
  const adj = addAdjustment({
    kind: 'in-out',
    date: toISODate(transactionDate.value),
    warehouseId: warehouseId.value,
    warehouseName: warehouseName(warehouseId.value),
    category: categoryId.value as any,
    tags: tagStrings(),
    memo: memo.value.trim() || undefined,
    lines,
  })
  toast.notify({ variant: 'success', title: 'Stock in/out created' })
  router.push('/stock-adjustments')
}

// ── Sticky footer divider ────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
onMounted(() => nextTick(() => {
  checkStageOverflow()
  stageObserver = new ResizeObserver(checkStageOverflow)
  if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
}))
onUnmounted(() => { stageObserver?.disconnect() })
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">All stock adjustments</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New stock in/out</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">
      <div class="scf-body">

        <!-- Header fields -->
        <div class="scf-form-grid">
          <MpFormControl id="scf-txdate" class="scf-f-date" is-required :is-invalid="transactionDateError">
            <MpFormLabel>Transaction date</MpFormLabel>
            <div class="scf-datepicker">
              <MpDatePicker id="scf-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="transactionDateError = false" />
            </div>
            <MpFormErrorMessage>Please enter a transaction date</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="scf-transno" class="scf-f-transno">
            <div class="scf-label-row">
              <MpFormLabel>Transaction no.</MpFormLabel>
              <span class="scf-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
            </div>
            <MpInput id="scf-transno-input" model-value="" placeholder="[Auto]" is-full-width is-disabled />
          </MpFormControl>

          <MpFormControl id="scf-tags" class="scf-f-tags">
            <MpFormLabel>Tags</MpFormLabel>
            <MpInputTag id="scf-tags-input" placeholder="Select tag" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
          </MpFormControl>

          <MpFormControl id="scf-warehouse" class="scf-f-warehouse" is-required :is-invalid="warehouseError">
            <MpFormLabel>Warehouse</MpFormLabel>
            <MpAutocomplete id="scf-warehouse-ac" v-model="warehouseId" :data="warehouseOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :is-invalid="warehouseError" @update:model-value="warehouseError = false" />
            <MpFormErrorMessage>Please select a warehouse</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="scf-category" class="scf-f-category" is-required :is-invalid="categoryError">
            <MpFormLabel>Category</MpFormLabel>
            <MpAutocomplete id="scf-category-ac" v-model="categoryId" :data="categoryOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :is-invalid="categoryError" @update:model-value="categoryError = false" />
            <MpFormErrorMessage>Please select a category</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="scf-account" class="scf-f-account">
            <MpFormLabel>Account</MpFormLabel>
            <MpAutocomplete id="scf-account-ac" v-model="accountId" :data="acctOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width />
          </MpFormControl>
        </div>

        <!-- Product table toolbar — right-aligned only (no count progress filter) -->
        <div class="scf-table-toolbar">
          <div class="scf-toolbar-right">
            <div class="scf-search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <input v-model="search" class="scf-search-input" type="text" placeholder="Search..." />
            </div>
            <button class="scf-import-btn" type="button" @click="importProducts">Import</button>
          </div>
        </div>

        <!-- Product table -->
        <div class="scf-table-section">
          <div class="scf-table-scroll">
            <table class="scf-table">
              <colgroup>
                <col class="scf-col-prod" /><col class="scf-col-sku" /><col class="scf-col-num" /><col class="scf-col-num" /><col class="scf-col-num" /><col class="scf-col-unit" /><col class="scf-col-num" /><col class="scf-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="scf-th">Product</th>
                  <th class="scf-th">SKU</th>
                  <th class="scf-th scf-th--num">On hand qty</th>
                  <th class="scf-th scf-th--num">Stock in/out qty</th>
                  <th class="scf-th scf-th--num">New on hand qty</th>
                  <th class="scf-th">Unit</th>
                  <th class="scf-th scf-th--num">Average cost</th>
                  <th class="scf-th scf-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in displayRows" :key="row.sku" class="scf-tr">
                  <td class="scf-td scf-td--prod">
                    <span class="scf-prod">
                      <img v-if="imgFor(row.sku)" class="scf-thumb" :src="imgFor(row.sku)" :alt="nameFor(row.sku)" loading="lazy" />
                      <span v-else class="scf-thumb scf-thumb--empty" />
                      <span class="scf-prod-info">
                        <span class="scf-prod-name">{{ nameFor(row.sku) }}</span>
                        <span v-if="descFor(row.sku)" class="scf-prod-desc">{{ descFor(row.sku) }}</span>
                      </span>
                    </span>
                  </td>
                  <td class="scf-td scf-td--muted">{{ row.sku }}</td>
                  <td class="scf-td scf-td--num">{{ onHandFor(row.sku).toLocaleString('id-ID') }}</td>
                  <!-- batch-tracked SKU -->
                  <td v-if="isBatchTrackedSku(row.sku)" class="scf-td scf-td--batch-counted">
                    <div class="scf-batch-row scf-batch-row--total">
                      <span v-if="batchHasCounts(row)" class="scf-batch-total">{{ batchTotalFor(row).toLocaleString('id-ID') }}</span>
                      <span v-else class="scf-batch-uncounted">—</span>
                    </div>
                    <div class="scf-batch-row scf-batch-row--action">
                      <button class="scf-batch-link" type="button" @click="openBatchDrawer(row)">Manage batch</button>
                    </div>
                  </td>
                  <!-- serial-tracked SKU -->
                  <td v-else-if="isSerialTrackedSku(row.sku)" class="scf-td scf-td--batch-counted scf-td--serial">
                    <div class="scf-batch-row scf-batch-row--total scf-batch-row--bare">
                      <input class="scf-qty-input" type="text" inputmode="numeric" :value="row.delta" placeholder="0" @input="onDeltaInput(row, $event)" />
                    </div>
                    <div class="scf-batch-row scf-batch-row--action">
                      <button class="scf-batch-link" type="button" @click="openSerialDrawer(row)">Manage serial number</button>
                    </div>
                  </td>
                  <!-- regular SKU -->
                  <td v-else class="scf-td scf-td--input">
                    <input class="scf-qty-input" type="text" inputmode="numeric" :value="row.delta" placeholder="0" @input="onDeltaInput(row, $event)" />
                  </td>
                  <!-- New on hand qty -->
                  <td
                    class="scf-td scf-td--num"
                    :class="{
                      'scf-diff--pos': (newOnHandFor(row) ?? onHandFor(row.sku)) > onHandFor(row.sku),
                      'scf-diff--neg': (newOnHandFor(row) ?? onHandFor(row.sku)) < onHandFor(row.sku),
                      'scf-diff--uncounted': newOnHandFor(row) === null,
                    }"
                  >
                    {{ newOnHandFor(row) !== null ? newOnHandFor(row)!.toLocaleString('id-ID') : '—' }}
                  </td>
                  <td class="scf-td scf-td--muted">{{ unitFor(row.sku) }}</td>
                  <td class="scf-td scf-td--num scf-td--avg" :class="{ 'scf-td--input': row.avgMode === 'custom' }">
                    <div class="scf-avg-wrap">
                      <template v-if="row.avgMode === 'custom'">
                        <span class="scf-avg-prefix">Rp</span>
                        <input class="scf-avg-num" type="text" inputmode="numeric" :value="row.avgCostInput" placeholder="0" @input="onAvgInput(row, $event)" />
                      </template>
                      <span v-else class="scf-avg-val">{{ fmtIDR(avgCostFor(row.sku)) }}</span>
                      <MpPopover :id="`scf-avg-${row.sku}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <button class="scf-avg-edit" type="button" aria-label="Edit average cost"><MpIcon name="edit" size="sm" /></button>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
                          <MpPopoverList>
                            <MpPopoverListItem :is-active="row.avgMode === 'auto'" @click="setAvgMode(row, 'auto')">Auto-calculate</MpPopoverListItem>
                            <MpPopoverListItem :is-active="row.avgMode === 'custom'" @click="setAvgMode(row, 'custom')">Custom</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </div>
                  </td>
                  <td class="scf-td scf-td--del">
                    <button class="scf-del-btn" type="button" aria-label="Remove product" @click="removeRow(row.sku)"><MpIcon name="minus-circular" size="sm" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button class="scf-add-btn" type="button" @click="drawerOpen = true">
            <MpIcon name="add" size="sm" /> Select product
          </button>
          <p v-if="formError" class="scf-form-error">{{ formError }}</p>
        </div>

        <!-- Memo -->
        <div class="scf-section scf-section--gap-top">
          <MpFormControl id="scf-memo">
            <MpFormLabel>Memo</MpFormLabel>
            <MpTextarea id="scf-memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="scf-helper-text">Only visible to you and your team</p>
        </div>

        <!-- Attachment -->
        <div class="scf-section scf-section--last">
          <div class="scf-section-label">Attachment</div>
          <div class="scf-attachment">
            <input ref="fileInput" type="file" multiple accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip" class="scf-file-hidden" @change="onFileChange" />
            <div class="scf-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">Choose file</MpButton>
              <span class="scf-attach-or">or drag and drop here</span>
            </div>
            <p class="scf-helper-text">Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
            <ul v-if="attachedFiles.length" class="scf-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="scf-file-item">
                <span class="scf-file-name">{{ f.name }}</span>
                <button class="scf-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="close" size="xs" /></button>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">Cancel</button>
      <button class="btn-enterprise btn-enterprise--primary" @click="handleSave">Save</button>
    </footer>

    <SelectProductDrawer v-model:open="drawerOpen" :products="pickerProducts" :model-value="selectedSkus" @save="applyPicker" />
    <ManageBatchDrawer
      v-if="batchDrawerRow"
      :open="batchDrawerOpen"
      :sku="batchDrawerRow.sku"
      :warehouse-id="warehouseId"
      kind="in-out"
      :model-value="batchDrawerRow.batchLines ?? []"
      @update:open="batchDrawerOpen = $event"
      @save="saveBatchLines"
    />
    <ManageSerialDrawer
      v-if="serialDrawerRow"
      :open="true"
      :sku="serialDrawerRow.sku"
      :warehouse-id="warehouseId"
      kind="in-out"
      :delta="parseDelta(serialDrawerRow.delta)"
      :target-count="Math.abs(parseDelta(serialDrawerRow.delta))"
      :model-value="serialDrawerRow.serialLines ?? []"
      @update:open="serialDrawerOpen = false"
      @save="saveSerialLines"
    />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; transition: border-top-color 0.15s; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.scf-body { display: flex; flex-direction: column; }
.scf-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 318px)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-4); align-items: start; }
.scf-f-date { grid-column: 1; grid-row: 1; }
.scf-f-transno { grid-column: 2; grid-row: 1; }
.scf-f-tags { grid-column: 3; grid-row: 1; }
.scf-f-warehouse { grid-column: 1; grid-row: 2; }
.scf-f-category { grid-column: 2; grid-row: 2; }
.scf-f-account { grid-column: 3; grid-row: 2; }
.scf-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.scf-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.scf-datepicker { width: 100%; }
.scf-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.scf-table-toolbar { margin-top: 32px; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); }
.scf-toolbar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.scf-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 280px; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); }
.scf-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.scf-search-input::placeholder { color: var(--mp-text-placeholder); }
.scf-import-btn { padding: var(--mp-spacing-2) var(--mp-spacing-4); border: 1px solid var(--mp-background-inverse, #080d0e); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-inverse, #080d0e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.scf-import-btn:hover { opacity: 0.9; }

.scf-table-section { margin-top: var(--mp-spacing-5); }
.scf-table-scroll { overflow-x: auto; }
.scf-table { width: 100%; table-layout: auto; border-collapse: collapse; border-spacing: 0; min-width: 900px; }
.scf-col-prod { width: 26%; } .scf-col-sku { width: 12%; } .scf-col-num { width: 12%; } .scf-col-unit { width: 8%; } .scf-col-del { width: 44px; }
.scf-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.scf-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.scf-th--del { padding: 0; }
.scf-td { padding: 8px var(--mp-spacing-4) 8px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; background: var(--mp-background-neutral-subtle); }
.scf-td--muted { color: var(--mp-text-secondary); }
.scf-td--num { text-align: right; white-space: nowrap; padding: 8px var(--mp-spacing-2) 8px var(--mp-spacing-4); }
.scf-diff--pos { color: var(--mp-text-success, #18794e); }
.scf-diff--neg { color: var(--mp-text-danger, #a8352d); }
.scf-diff--uncounted { color: var(--mp-text-secondary); }
.scf-td--avg.scf-td--input { height: 1px; }
.scf-avg-wrap { display: flex; align-items: center; width: 100%; height: 100%; min-height: var(--mp-sizes-10, 40px); }
.scf-avg-val { margin-left: auto; font-variant-numeric: tabular-nums; padding-right: var(--mp-spacing-2); }
.scf-avg-prefix { align-self: stretch; display: flex; align-items: center; padding: 0 var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); border-right: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); white-space: nowrap; }
.scf-avg-num { flex: 1; min-width: 0; text-align: right; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2); border: none; background: transparent; color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none; }
.scf-avg-edit { visibility: hidden; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin-right: var(--mp-spacing-1); padding: 0; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-icon-default); flex-shrink: 0; }
.scf-tr:hover .scf-avg-edit { visibility: visible; }
.scf-avg-edit:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
.scf-prod { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.scf-thumb { width: 40px; height: 40px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0; border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral); }
.scf-thumb--empty { background: var(--mp-background-neutral-subtle); }
.scf-prod-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.scf-prod-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-prod-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.scf-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.scf-td--batch-counted { padding: 0; background: var(--mp-background-neutral-subtle); display: flex; flex-direction: column; vertical-align: top; border-left: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); }
.scf-batch-row {
  height: var(--mp-sizes-10, 40px); flex-shrink: 0;
  display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--mp-spacing-2);
}
.scf-batch-row--total { border-bottom: 1px solid var(--mp-border-default); }
.scf-batch-row--bare { padding: 0; border-bottom: 1px solid var(--mp-border-default); }
.scf-td--serial { background: var(--mp-background-neutral, #fff); }
.scf-td--serial:focus-within .scf-batch-row--bare { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.scf-batch-total { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.scf-batch-uncounted { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.scf-batch-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); text-align: right; white-space: nowrap; }
.scf-batch-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.scf-qty-input { width: 100%; text-align: right; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2); border: none; background: transparent; color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none; }
.scf-qty-input::placeholder { color: var(--mp-text-placeholder); }
.scf-td--del { padding: 0; text-align: center; }
.scf-del-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); }
.scf-del-btn:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-danger, #dc2626); }
.scf-add-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); background: none; border: none; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.scf-add-btn:hover { background: var(--mp-background-neutral-subtle); }
.scf-form-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

.scf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; padding: var(--mp-spacing-6) 0; }
.scf-section--gap-top { padding-top: 32px; padding-bottom: 0; }
.scf-section--last { padding-top: 20px; }
.scf-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
.scf-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.scf-file-hidden { display: none; }
.scf-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.scf-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.scf-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.scf-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.scf-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.scf-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.scf-file-remove:hover { color: var(--mp-text-default); }
</style>
