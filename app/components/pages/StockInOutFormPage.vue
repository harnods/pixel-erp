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
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import { warehouses } from '~/data/warehouses'
import { productBySku, PRODUCTS } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { stockLocationPaths } from '~/data/storageLocations'
import { addAdjustment, accountOptions, IN_OUT_CATEGORIES } from '~/data/stockAdjustments'
import { addWmsAdjustment } from '~/data/wmsStockAdjustments'
import { scrollToFirstError } from '~/utils/form'
import { useUnsavedChangesGuard } from '~/composables/useUnsavedChangesGuard'

const router = useRouter()
const route = useRoute()
const { activeScenario } = useScenario()
const isWms = computed(() => activeScenario.value.startsWith('WMS'))

function toDisplayDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toISODate(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ── Options ───────────────────────────────────────────────────────────────────────
const warehouseOptions = computed(() => warehouses.filter(w => w.status === 'active').map(w => ({ id: w.id, name: w.name })))
const realWarehouses = warehouses.filter(w => w.status === 'active' && !w.isDefault)
function warehouseName(id: string) { return warehouseOptions.value.find(w => w.id === id)?.name ?? '' }
const acctOptions = accountOptions()
const categoryOptions = IN_OUT_CATEGORIES.map(c => ({ id: c, name: c }))

// ── Form state ────────────────────────────────────────────────────────────────────
const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)
const warehouseId = ref(realWarehouses[0]?.id ?? warehouseOptions.value[0]?.id ?? '')
const warehouseError = ref(false)
const categoryId = ref<string>('General')
const categoryError = ref(false)
const accountId = ref(acctOptions.find(a => a.id === 'Inventory adjustment')?.id ?? acctOptions[0]?.id ?? '')
const tags = ref<DataInterface[]>([])
const memo = ref('')

// ── Warehouse stock ───────────────────────────────────────────────────────────────
const stock = computed(() => warehouseId.value ? getWarehouseDetail(warehouseId.value)?.stock ?? [] : [])
const stockMap = computed(() => new Map(stock.value.map(s => [s.sku, s])))
function onHandFor(sku: string): number { return stockMap.value.get(sku)?.onHand ?? 0 }
function unitFor(sku: string): string { return stockMap.value.get(sku)?.unit ?? productBySku(sku)?.unit ?? '' }
function avgCostFor(sku: string): number { return productBySku(sku)?.averageCost ?? 0 }
function nameFor(sku: string): string { return stockMap.value.get(sku)?.name ?? productBySku(sku)?.name ?? sku }
function photoFor(sku: string): string | undefined { return stockMap.value.get(sku)?.photo ?? productBySku(sku)?.img }
function idFor(sku: string): string { return stockMap.value.get(sku)?.id ?? sku }

const pickerProducts = computed<PickerProduct[]>(() =>
  PRODUCTS.map(p => ({ sku: p.sku, name: p.name, img: p.img, desc: p.desc })),
)

// ── Storage location options for the current warehouse ────────────────────────────
const locationOptions = computed(() => {
  const paths = stockLocationPaths(warehouseId.value)
  const seen = new Set<string>()
  const result: { id: string; name: string }[] = []
  for (const p of paths) {
    if (p && !seen.has(p)) { seen.add(p); result.push({ id: p, name: p }) }
  }
  return result
})

// ── Batch / serial helpers ────────────────────────────────────────────────────────
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

// ── Data model ────────────────────────────────────────────────────────────────────
interface LocationRow { locationId: string; delta: string; deltaError: boolean; batchLines?: CommittedBatch[]; serialLines?: string[] }
interface ProductRow {
  sku: string
  locationRows: LocationRow[]
  avgMode: 'auto' | 'custom'
  avgCostInput: string
}

const rows = ref<ProductRow[]>([])
const selectedSkus = computed(() => rows.value.map(r => r.sku))

function makeProductRow(sku: string): ProductRow {
  return { sku, locationRows: [], avgMode: 'auto', avgCostInput: '' }
}

function applyPicker(skus: string[]) {
  const existing = new Map(rows.value.map(r => [r.sku, r]))
  rows.value = skus.map(sku => existing.get(sku) ?? makeProductRow(sku))
}

function removeRow(sku: string) { rows.value = rows.value.filter(r => r.sku !== sku) }
function removeLocRow(row: ProductRow, idx: number) { row.locationRows.splice(idx, 1) }

// ── Location picker (MpPopover pattern) ──────────────────────────────────────────
const activeLocKey = ref<string | null>(null)
const locSearch = ref('')
function locKey(sku: string, li: number) { return `${sku}-${li}` }
function pendingLocKey(sku: string) { return `pending-${sku}` }
function openLocPicker(key: string) { activeLocKey.value = key; locSearch.value = '' }
function closeLocPicker(key: string) { if (activeLocKey.value === key) { activeLocKey.value = null; locSearch.value = '' } }
function locOptionsFiltered(row: ProductRow) {
  const q = locSearch.value.trim().toLowerCase()
  const used = new Set(row.locationRows.map(lr => lr.locationId).filter(Boolean))
  return locationOptions.value.filter(o => !used.has(o.id) && (!q || o.name.toLowerCase().includes(q)))
}
function selectLocation(row: ProductRow, li: number, locId: string) {
  const lr = row.locationRows[li]; if (lr) lr.locationId = locId
  activeLocKey.value = null; locSearch.value = ''
}
function selectPendingLoc(row: ProductRow, locId: string) {
  row.locationRows.push({ locationId: locId, delta: '', deltaError: false })
  activeLocKey.value = null; locSearch.value = ''
}

// ── Per-location on-hand — reads the item's real per-bin split directly
// (warehouseDetails.ts's WarehouseStockItem.bins), no more recomputed guess. ────────
function onHandForLocation(sku: string, locationId: string): number {
  if (!locationId) return 0
  const item = stockMap.value.get(sku)
  return item?.bins?.find(b => b.location === locationId)?.onHand ?? 0
}

// ── Delta input ───────────────────────────────────────────────────────────────────
function onDeltaInput(locRow: LocationRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const raw = input.value
  const isNeg = raw.startsWith('-')
  const digits = raw.replace(/[^0-9]/g, '')
  const formatted = digits
    ? (isNeg ? '-' : '') + Number(digits).toLocaleString('id-ID')
    : (isNeg ? '-' : '')
  locRow.delta = formatted
  locRow.deltaError = false
  nextTick(() => { input.setSelectionRange(input.value.length, input.value.length) })
}

function parseDelta(val: string): number {
  const isNeg = val.trim().startsWith('-')
  const abs = Number(val.replace(/[^0-9]/g, '')) || 0
  return isNeg ? -abs : abs
}

function newOnHandForLocRow(sku: string, locRow: LocationRow): number | null {
  if (isBatchTrackedSku(sku)) {
    if (!locBatchHasCounts(locRow)) return null
    return onHandForLocation(sku, locRow.locationId) + locBatchTotal(locRow)
  }
  if (locRow.delta.trim() === '' || locRow.delta.trim() === '-') return null
  return onHandForLocation(sku, locRow.locationId) + parseDelta(locRow.delta)
}

// ── Batch drawer (per location row) ───────────────────────────────────────────────
const drawerOpen = ref(false)
const batchDrawerLocRow = ref<LocationRow | null>(null)
const batchDrawerSku = ref('')
const batchDrawerOpen = computed({
  get: () => batchDrawerLocRow.value !== null,
  set: (v) => { if (!v) batchDrawerLocRow.value = null },
})
function openBatchDrawer(row: ProductRow, locRow: LocationRow) { batchDrawerSku.value = row.sku; batchDrawerLocRow.value = locRow }
function saveBatchLines(batches: CommittedBatch[]) {
  if (!batchDrawerLocRow.value) return
  batchDrawerLocRow.value.batchLines = batches
}
function locBatchHasCounts(locRow: LocationRow): boolean {
  return (locRow.batchLines ?? []).some(b => b.counted !== null)
}
function locBatchTotal(locRow: LocationRow): number {
  return (locRow.batchLines ?? []).reduce((s, b) => s + (b.counted ?? 0), 0)
}

// ── Serial drawer (per location row) ──────────────────────────────────────────────
const serialDrawerLocRow = ref<LocationRow | null>(null)
const serialDrawerSku = ref('')
const serialDrawerOpen = computed({
  get: () => serialDrawerLocRow.value !== null,
  set: (v) => { if (!v) serialDrawerLocRow.value = null },
})
function openSerialDrawer(row: ProductRow, locRow: LocationRow) {
  if (locRow.delta.trim() === '' || locRow.delta.trim() === '-') {
    toast.notify({ variant: 'error', title: 'Enter stock in/out qty first' , maxWidth: 'max-content'})
    return
  }
  serialDrawerSku.value = row.sku
  serialDrawerLocRow.value = locRow
}
function saveSerialLines(serials: CommittedSerial[]) {
  if (!serialDrawerLocRow.value) return
  serialDrawerLocRow.value.serialLines = serials.map(cs => cs.serial)
}
function locSerialHasCounts(locRow: LocationRow): boolean { return (locRow.serialLines?.length ?? 0) > 0 }
function locSerialTotal(locRow: LocationRow): number { return locRow.serialLines?.length ?? 0 }

// ── Average cost ──────────────────────────────────────────────────────────────────
function onAvgInput(row: ProductRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  row.avgCostInput = digits ? Number(digits).toLocaleString('id-ID') : ''
  nextTick(() => { input.setSelectionRange(input.value.length, input.value.length) })
}
function setAvgMode(row: ProductRow, mode: 'auto' | 'custom') {
  row.avgMode = mode
  if (mode === 'custom' && row.avgCostInput === '') {
    const cost = avgCostFor(row.sku)
    row.avgCostInput = cost > 0 ? cost.toLocaleString('id-ID') : ''
  }
}
function fmtIDR(n: number) { return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }) }

// ── Search ────────────────────────────────────────────────────────────────────────
const search = ref('')
const displayRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => nameFor(r.sku).toLowerCase().includes(q) || r.sku.toLowerCase().includes(q))
})
function importProducts() {}

// ── Tags ──────────────────────────────────────────────────────────────────────────
function onTagsChange(data: DataInterface[]) { tags.value = data }
function tagStrings(): string[] { return tags.value.map(t => String(t.text ?? t.value ?? '')).map(s => s.trim()).filter(Boolean) }

// ── Attachment ────────────────────────────────────────────────────────────────────
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

// ── Save ──────────────────────────────────────────────────────────────────────────
const fromStockCounts = computed(() => route.query.from === 'stock-counts')
function goBack() {
  if (fromStockCounts.value) { router.push('/stock-counts'); return }
  router.push(isWms.value ? '/stock-inout' : '/stock-adjustments')
}
const formError = ref('')
const isSaving = ref(false)
async function handleSave() {
  formError.value = ''
  let valid = true
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (!categoryId.value) { categoryError.value = true; valid = false }
  if (!rows.value.length) { formError.value = 'You must add at least one product'; valid = false }
  for (const r of rows.value) {
    if (!isSerialTrackedSku(r.sku)) continue
    for (const loc of r.locationRows) {
      if (loc.delta.trim() === '' || loc.delta.trim() === '-') continue
      const expected = Math.abs(parseDelta(loc.delta))
      const actual = loc.serialLines?.length ?? 0
      if (actual !== expected) {
        formError.value = `Enter all serial numbers for "${nameFor(r.sku)}" (${actual}/${expected} entered)`
        valid = false
      }
    }
  }
  if (!valid) { scrollToFirstError(); return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))

  const lines = rows.value.map(r => ({
    sku: r.sku,
    qty: r.locationRows.reduce((sum, loc) => {
      if (isBatchTrackedSku(r.sku)) return sum + locBatchTotal(loc)
      return sum + parseDelta(loc.delta)
    }, 0),
  }))
  const input = {
    kind: 'in-out' as const,
    date: toISODate(transactionDate.value),
    warehouseId: warehouseId.value,
    warehouseName: warehouseName(warehouseId.value),
    category: categoryId.value as any,
    tags: tagStrings(),
    memo: memo.value.trim() || undefined,
    lines,
  }
  isWms.value ? addWmsAdjustment(input) : addAdjustment(input)
  toast.notify({ variant: 'success', title: 'Stock in/out created' , maxWidth: 'max-content'})
  // Already saved — the router.push below is this function's own doing, not
  // the operator losing unsaved work, so the guard mustn't fire on it.
  disableUnsavedChangesGuard()
  router.push(isWms.value ? '/stock-inout' : '/stock-adjustments')
}

// ── Warn before losing an in-progress stock in/out form — refresh/close-tab
// (native prompt) and in-app navigation/Back button (modal rendered once at
// the app root, see [...slug].vue — this app has a single catch-all route, so
// a per-page modal/onBeforeRouteLeave never fires). "Unsaved" = at least one
// product line added. No saveDraft option — this is a one-shot form, so the
// modal offers only Leave/Cancel. disableUnsavedChangesGuard() is called by
// handleSave() right before its own router.push — otherwise
// hasUnsavedChanges() would still read true (nothing else clears the added
// lines after save) and the "Leave without saving?" modal would fire right
// after the operator's own intentional Save action. ─────────────────────────
const { disableGuard: disableUnsavedChangesGuard } = useUnsavedChangesGuard({
  hasUnsavedChanges: () => rows.value.length > 0,
})

// ── Sticky footer ─────────────────────────────────────────────────────────────────
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
        <button class="detail-breadcrumb" @click="goBack">{{ fromStockCounts ? 'All stock counts' : 'All stock adjustments' }}</button>
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
            <MpFormErrorMessage>You must select transaction date</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="scf-transno" class="scf-f-transno">
            <div class="scf-label-row">
              <MpFormLabel>Transaction no.</MpFormLabel>
              <span class="scf-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
            </div>
            <MpInput id="scf-transno-input" model-value="" placeholder="[Auto]" is-full-width is-disabled />
          </MpFormControl>

          <MpFormControl v-if="!isWms" id="scf-tags" class="scf-f-tags">
            <MpFormLabel>Tags</MpFormLabel>
            <MpInputTag id="scf-tags-input" placeholder="Select tag" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
          </MpFormControl>

          <MpFormControl id="scf-category" class="scf-f-category" is-required :is-invalid="categoryError">
            <MpFormLabel>Category</MpFormLabel>
            <MpAutocomplete id="scf-category-ac" v-model="categoryId" :data="categoryOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :is-invalid="categoryError" @update:model-value="categoryError = false" />
            <MpFormErrorMessage>You must select category</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl v-if="!isWms" id="scf-account" class="scf-f-account">
            <MpFormLabel>Account</MpFormLabel>
            <MpAutocomplete id="scf-account-ac" v-model="accountId" :data="acctOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width />
          </MpFormControl>

          <MpFormControl id="scf-warehouse" class="scf-f-warehouse" is-required :is-invalid="warehouseError">
            <MpFormLabel>Warehouse</MpFormLabel>
            <MpAutocomplete id="scf-warehouse-ac" v-model="warehouseId" :data="warehouseOptions" label-prop="name" value-prop="id" is-searchable use-portal is-full-width :is-invalid="warehouseError" @update:model-value="warehouseError = false" />
            <MpFormErrorMessage>You must select warehouse</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <!-- Products section -->
        <div class="sio-products-section">

          <!-- Section toolbar: warehouse name + search + import -->
          <div class="sio-toolbar">
            <h2 class="sio-wh-name">{{ warehouseName(warehouseId) }}</h2>
            <div class="sio-toolbar-right">
              <div class="scf-search">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <input v-model="search" class="scf-search-input" type="text" placeholder="Search..." />
                <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <button class="scf-import-btn" type="button" @click="importProducts">Import</button>
            </div>
          </div>

          <!-- Select product pill -->
          <button class="sio-select-prod-btn" type="button" @click="drawerOpen = true">
            <MpIcon name="add" size="sm" />
            <span>Select product{{ rows.length ? ` (${rows.length})` : '' }}</span>
          </button>

          <!-- Product groups -->
          <div v-if="displayRows.length" class="sio-product-list">
            <div v-for="row in displayRows" :key="row.sku" class="sio-product-group">

              <!-- Product header row -->
              <div class="sio-product-header">
                <div class="sio-product-info">
                  <img v-if="photoFor(row.sku)" class="sio-thumb" :src="photoFor(row.sku)" :alt="nameFor(row.sku)" loading="lazy" />
                  <span v-else class="sio-thumb sio-thumb--empty" />
                  <div class="sio-product-meta">
                    <span class="sio-product-name">{{ nameFor(row.sku) }}</span>
                    <span class="sio-product-id">{{ row.sku }}</span>
                  </div>
                </div>
                <div class="sio-product-avg">
                  <span class="sio-avg-label">Average cost</span>
                  <div class="sio-avg-value-wrap">
                    <template v-if="row.avgMode === 'custom'">
                      <span class="sio-avg-prefix">Rp</span>
                      <input class="sio-avg-num" type="text" inputmode="numeric" :value="row.avgCostInput" placeholder="0" @input="onAvgInput(row, $event)" />
                    </template>
                    <span v-else class="sio-avg-value">{{ fmtIDR(avgCostFor(row.sku)) }}</span>
                    <MpPopover :id="`sio-avg-${row.sku}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                      <MpPopoverTrigger>
                        <button class="sio-avg-edit" type="button" aria-label="Edit average cost"><MpIcon name="edit" size="sm" /></button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
                        <MpPopoverList>
                          <MpPopoverListItem :is-active="row.avgMode === 'auto'" @click="setAvgMode(row, 'auto')">Auto-calculate</MpPopoverListItem>
                          <MpPopoverListItem :is-active="row.avgMode === 'custom'" @click="setAvgMode(row, 'custom')">Custom</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </div>
                </div>
                <button class="sio-remove-prod" type="button" aria-label="Remove product" @click="removeRow(row.sku)">
                  <MpIcon name="minus-circular" size="sm" />
                </button>
              </div>

              <!-- Location sub-table: all products (batch, SN, regular) -->
              <div class="sio-loc-table-wrap">
                <table class="sio-loc-table">
                  <colgroup>
                    <col class="sio-col-loc" /><col class="sio-col-num" /><col class="sio-col-num" /><col class="sio-col-num" /><col class="sio-col-action" /><col class="sio-col-unit" /><col class="sio-col-del" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="sio-th">Location</th>
                      <th class="sio-th sio-th--num">On hand qty</th>
                      <th class="sio-th sio-th--num">Stock in/out qty</th>
                      <th class="sio-th sio-th--num">New on hand qty</th>
                      <th class="sio-th" />
                      <th class="sio-th">Unit</th>
                      <th class="sio-th sio-th--del" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(locRow, li) in row.locationRows" :key="li" class="sio-loc-row">
                      <td class="sio-td sio-td--loc">
                        <MpPopover :id="`sio-loc-${row.sku}-${li}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="closeLocPicker(locKey(row.sku, li))">
                          <MpPopoverTrigger>
                            <div class="sio-loc-trigger">
                              <input
                                :id="`sio-loc-input-${row.sku}-${li}`"
                                class="sio-loc-input"
                                type="text"
                                autocomplete="off"
                                :value="activeLocKey === locKey(row.sku, li) ? locSearch : locRow.locationId"
                                placeholder="Select location"
                                @focus="openLocPicker(locKey(row.sku, li))"
                                @input="activeLocKey = locKey(row.sku, li); locSearch = ($event.target as HTMLInputElement).value"
                              />
                              <svg class="sio-loc-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </div>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ width: '360px', maxHeight: '300px', overflowY: 'auto', padding: '0' })">
                            <MpPopoverList>
                              <MpPopoverListItem v-for="opt in locOptionsFiltered(row)" :key="opt.id" :is-active="opt.id === locRow.locationId" @click="selectLocation(row, li, opt.id)">{{ opt.name }}</MpPopoverListItem>
                              <p v-if="!locOptionsFiltered(row).length" class="sio-loc-none">No locations found.</p>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </td>
                      <td class="sio-td sio-td--num">{{ onHandForLocation(row.sku, locRow.locationId).toLocaleString('id-ID') }}</td>
                      <!-- Stock in/out column: conditional on product type -->
                      <td v-if="isBatchTrackedSku(row.sku)" class="sio-td sio-td--num">
                        <span v-if="locBatchHasCounts(locRow)" class="sio-batch-val">{{ locBatchTotal(locRow).toLocaleString('id-ID') }}</span>
                        <span v-else class="sio-batch-empty">—</span>
                      </td>
                      <td v-else-if="isSerialTrackedSku(row.sku)" class="sio-td sio-td--input">
                        <input
                          class="sio-qty-input"
                          type="text"
                          inputmode="numeric"
                          :value="locRow.delta"
                          placeholder="0"
                          @input="onDeltaInput(locRow, $event)"
                        />
                      </td>
                      <td v-else class="sio-td sio-td--input">
                        <input
                          class="sio-qty-input"
                          type="text"
                          inputmode="numeric"
                          :value="locRow.delta"
                          placeholder="0"
                          @input="onDeltaInput(locRow, $event)"
                        />
                      </td>
                      <!-- Action column -->
                      <td v-if="isBatchTrackedSku(row.sku)" class="sio-td sio-td--action">
                        <button class="sio-manage-btn" type="button" @click="openBatchDrawer(row, locRow)">Manage batch</button>
                      </td>
                      <td v-else-if="isSerialTrackedSku(row.sku)" class="sio-td sio-td--action">
                        <button class="sio-manage-btn" type="button" @click="openSerialDrawer(row, locRow)">Manage serial numbers</button>
                      </td>
                      <td v-else class="sio-td sio-td--action" />
                      <td
                        class="sio-td sio-td--num"
                        :class="{
                          'sio-diff--pos': (newOnHandForLocRow(row.sku, locRow) ?? onHandForLocation(row.sku, locRow.locationId)) > onHandForLocation(row.sku, locRow.locationId),
                          'sio-diff--neg': (newOnHandForLocRow(row.sku, locRow) ?? onHandForLocation(row.sku, locRow.locationId)) < onHandForLocation(row.sku, locRow.locationId),
                          'sio-diff--neutral': newOnHandForLocRow(row.sku, locRow) === null,
                        }"
                      >
                        {{ newOnHandForLocRow(row.sku, locRow) !== null ? newOnHandForLocRow(row.sku, locRow)!.toLocaleString('id-ID') : onHandForLocation(row.sku, locRow.locationId).toLocaleString('id-ID') }}
                      </td>
                      <td class="sio-td sio-td--muted">{{ unitFor(row.sku) }}</td>
                      <td class="sio-td sio-td--del">
                        <button class="sio-del-loc-btn" type="button" aria-label="Remove location" @click="removeLocRow(row, li)">
                          <MpIcon name="minus-circular" size="sm" />
                        </button>
                      </td>
                    </tr>
                    <!-- Add location row -->
                    <tr class="sio-add-loc-row">
                      <td class="sio-td sio-td--add-loc">
                        <MpPopover :id="`sio-addloc-${row.sku}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="closeLocPicker(pendingLocKey(row.sku))">
                          <MpPopoverTrigger>
                            <div class="sio-loc-trigger">
                              <input
                                :id="`sio-addloc-input-${row.sku}`"
                                class="sio-loc-input"
                                type="text"
                                autocomplete="off"
                                :value="activeLocKey === pendingLocKey(row.sku) ? locSearch : ''"
                                placeholder="Select location"
                                @focus="openLocPicker(pendingLocKey(row.sku))"
                                @input="activeLocKey = pendingLocKey(row.sku); locSearch = ($event.target as HTMLInputElement).value"
                              />
                              <svg class="sio-loc-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </div>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ width: '360px', maxHeight: '300px', overflowY: 'auto', padding: '0' })">
                            <MpPopoverList>
                              <MpPopoverListItem v-for="opt in locOptionsFiltered(row)" :key="opt.id" @click="selectPendingLoc(row, opt.id)">{{ opt.name }}</MpPopoverListItem>
                              <p v-if="!locOptionsFiltered(row).length" class="sio-loc-none">No locations found.</p>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </td>
                      <td class="sio-td sio-td--add-loc-spacer" colspan="6" />
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          </div>

          <!-- Showing X of Y products -->
          <p v-if="rows.length" class="sio-product-count">Showing {{ displayRows.length }} of {{ rows.length }} products</p>
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
            <p class="scf-helper-text">File must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
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
      <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : 'Save' }}</button>
    </footer>

    <SelectProductDrawer v-model:open="drawerOpen" :products="pickerProducts" :model-value="selectedSkus" @save="applyPicker" />
    <ManageBatchDrawer
      v-if="batchDrawerLocRow"
      :open="batchDrawerOpen"
      :sku="batchDrawerSku"
      :warehouse-id="warehouseId"
      kind="in-out"
      :model-value="batchDrawerLocRow.batchLines ?? []"
      @update:open="batchDrawerOpen = $event"
      @save="saveBatchLines"
    />
    <ManageSerialDrawer
      v-if="serialDrawerLocRow"
      :open="true"
      :sku="serialDrawerSku"
      :warehouse-id="warehouseId"
      kind="in-out"
      :delta="parseDelta(serialDrawerLocRow.delta)"
      :target-count="Math.abs(parseDelta(serialDrawerLocRow.delta))"
      :model-value="(serialDrawerLocRow.serialLines ?? []).map(s => ({ serial: s }))"
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

/* ── Form grid ─────────────────────────────────────────────────────────────────── */
.scf-body { display: flex; flex-direction: column; }
.scf-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 318px)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-4); align-items: start; }
.scf-f-date    { grid-column: 1; grid-row: 1; }
.scf-f-transno { grid-column: 2; grid-row: 1; }
.scf-f-tags    { grid-column: 3; grid-row: 1; }
.scf-f-category { grid-column: 1; grid-row: 2; }
.scf-f-account  { grid-column: 2; grid-row: 2; }
.scf-f-warehouse { grid-column: 1; grid-row: 3; }
.scf-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.scf-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.scf-datepicker { width: 100%; }
.scf-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* ── Products section ──────────────────────────────────────────────────────────── */
.sio-products-section { margin-top: 32px; }

.sio-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }
.sio-wh-name { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sio-toolbar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.scf-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 280px; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); }
.scf-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.scf-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.scf-import-btn { padding: var(--mp-spacing-2) var(--mp-spacing-4); border: 1px solid var(--mp-background-inverse, #080d0e); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-inverse, #080d0e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.scf-import-btn:hover { opacity: 0.9; }

.sio-select-prod-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-4); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); background: none; cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.sio-select-prod-btn:hover { background: var(--mp-background-neutral-subtle); }

/* ── Product group ──────────────────────────────────────────────────────────────── */
.sio-product-list { margin-top: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 0; }
.sio-product-group { margin-bottom: var(--mp-spacing-4); }

.sio-product-header { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) 0; }
.sio-product-info { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 0 0 320px; min-width: 0; }
.sio-thumb { width: 40px; height: 40px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0; border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral); }
.sio-thumb--empty { display: block; background: var(--mp-background-neutral-subtle); }
.sio-product-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sio-product-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sio-product-id { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.sio-product-avg { display: flex; flex-direction: column; gap: 0; flex-shrink: 0; }
.sio-avg-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; line-height: var(--mp-line-heights-sm); }
.sio-avg-value-wrap { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.sio-avg-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sio-avg-prefix { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.sio-avg-num { width: 120px; border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-sm); padding: var(--mp-spacing-1) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); text-align: right; background: var(--mp-background-neutral, #fff); outline: none; font-variant-numeric: tabular-nums; }
.sio-avg-edit { visibility: hidden; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-icon-default); flex-shrink: 0; }
.sio-product-group:hover .sio-avg-edit { visibility: visible; }
.sio-avg-edit:hover { background: var(--mp-background-neutral); }

.sio-remove-prod { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0; margin-left: auto; }
.sio-remove-prod:hover { background: var(--mp-background-neutral); color: var(--mp-text-danger, #dc2626); }

/* ── Batch / serial values in location table ───────────────────────────────────── */
.sio-batch-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.sio-batch-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Location sub-table ─────────────────────────────────────────────────────────── */
.sio-loc-table-wrap { overflow-x: auto; }
.sio-loc-table { width: 100%; table-layout: auto; border-collapse: collapse; min-width: 640px; }
.sio-col-loc    { width: 46%; }
.sio-col-num    { width: 12%; }
.sio-col-action { width: auto; }
.sio-col-unit   { width: 7%; }
.sio-col-del    { width: 52px; }
.sio-th { height: 28px; text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; letter-spacing: 0.04em; }
.sio-th--num { text-align: right; }
.sio-td { padding: 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; height: var(--mp-sizes-10, 40px); border-right: 1px solid var(--mp-border-default); background: var(--mp-background-neutral, #fff); }
.sio-td--muted { color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); }
.sio-td--num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; background: var(--mp-background-neutral-subtle); }
.sio-td--del { border-right: none; text-align: center; padding: 0; background: var(--mp-background-neutral-subtle); }
.sio-td--loc { padding: 0; }
.sio-td--loc { padding: 0; }
.sio-td--loc:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.sio-loc-trigger { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 100%; min-height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3); cursor: text; }
.sio-loc-input { flex: 1; min-width: 0; border: none; outline: none; background: none; padding: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sio-loc-input::placeholder { color: var(--mp-text-placeholder); }
.sio-loc-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.sio-loc-none { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: center; }
.sio-td--input { padding: 0; }
.sio-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.sio-td--add-loc { padding: 0; }
.sio-qty-input { width: 100%; text-align: right; height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3); border: none; background: transparent; color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none; }
.sio-qty-input::placeholder { color: var(--mp-text-placeholder); }
.sio-diff--pos { color: var(--mp-text-success, #18794e); }
.sio-diff--neg { color: var(--mp-text-danger, #a8352d); }
.sio-diff--neutral { color: var(--mp-text-default); }
.sio-del-loc-btn { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 100%; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); }
.sio-del-loc-btn:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-danger, #dc2626); }

.sio-td--add-loc-spacer { background: var(--mp-background-neutral, #fff); border-right: none; }

/* ── Action column ───────────────────────────────────────────────────────────────── */
.sio-td--action { padding: 10px var(--mp-spacing-2); vertical-align: top; white-space: nowrap; }
.sio-manage-btn { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.sio-manage-btn:hover { text-decoration: underline; text-underline-offset: 2px; }

.sio-product-count { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.scf-form-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

/* ── Memo / attachment ──────────────────────────────────────────────────────────── */
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
