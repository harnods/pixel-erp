<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpInput, MpTextarea, MpButton, MpIcon,
  MpDatePicker,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpBanner, MpBannerDescription,
  toast, css,
  type DataInterface,
} from '@mekari/pixel3'
import ManageBatchDrawer, { type CommittedBatch } from '~/components/patterns/ManageBatchDrawer.vue'
import ManageSerialDrawer, { type CommittedSerial } from '~/components/patterns/ManageSerialDrawer.vue'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { warehouses } from '~/data/warehouses'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { addTransfer, updateTransfer, getTransfer, transferLineItems, transferMemo } from '~/data/warehouseTransfers'
import { stockLocationPaths } from '~/data/storageLocations'
import { scrollToFirstError } from '~/utils/form'
import { useUnsavedChangesGuard } from '~/composables/useUnsavedChangesGuard'

// The catch-all route binds the id via the generic `orderId` prop. 'new' → create mode.
const props = defineProps<{ orderId: string }>()
const router = useRouter()

const isEdit = computed(() => props.orderId !== 'new')
const editing = computed(() => (isEdit.value ? getTransfer(props.orderId) : undefined))

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ── Warehouse options (all active, default included — a transfer can start anywhere) ─
const warehouseOptions = computed(() =>
  warehouses.filter(w => w.status === 'active').map(w => ({ id: w.id, name: w.name })),
)
function warehouseName(id: string) { return warehouseOptions.value.find(w => w.id === id)?.name ?? '' }

// ── Form state ───────────────────────────────────────────────────────────────────
const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)
const originId = ref('')
const destId = ref('')
const originError = ref(false)
const destError = ref(false)
const tags = ref<DataInterface[]>([])
const memo = ref('')

// ── Origin / destination stock (coherent with the warehouse detail pages) ──────────
const originStock = computed(() => (originId.value ? getWarehouseDetail(originId.value)?.stock ?? [] : []))
const destStock = computed(() => (destId.value ? getWarehouseDetail(destId.value)?.stock ?? [] : []))
const originStockMap = computed(() => new Map(originStock.value.map(s => [s.sku, s])))
const destStockMap = computed(() => new Map(destStock.value.map(s => [s.sku, s])))
const productOptions = computed(() => originStock.value.map(s => {
  const p = productBySku(s.sku)
  return { id: s.sku, name: s.name, desc: p?.desc ?? '', img: p?.img ?? s.photo, unit: s.unit }
}))
function availableFor(sku: string): number { return originStockMap.value.get(sku)?.available ?? 0 }
function onHandFor(sku: string): number | undefined { return destStockMap.value.get(sku)?.onHand }

// ── Batch / serial detection (mirrors StockInOut logic) ────────────────────────────
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans'])
function isBatchTrackedSku(sku: string): boolean {
  const si = originStockMap.value.get(sku)
  if (si) return (si.batches?.length ?? 0) > 0
  const p = productBySku(sku)
  return p ? BATCH_CATS.has(p.category) : false
}
const SERIAL_CATS = new Set(['Espresso Machine', 'Grinder', 'Equipment'])
function isSerialTrackedSku(sku: string): boolean {
  const si = originStockMap.value.get(sku)
  if (si) return !!si.serials
  const p = productBySku(sku)
  return p ? SERIAL_CATS.has(p.category) : false
}

// ── Product line rows ──────────────────────────────────────────────────────────────
interface LocationQty { locationId: string; qty: string }
interface LineRow { id: number; sku: string; productName: string; desc: string; img: string; unit: string; qty: string; qtyError: boolean; batchLines?: CommittedBatch[]; serialLines?: CommittedSerial[]; originLocations?: LocationQty[]; destLocations?: LocationQty[] }
let rowSeq = 0
function makeRow(sku: string): LineRow {
  const p = productBySku(sku)
  return { id: rowSeq++, sku, productName: p?.name ?? '', desc: p?.desc ?? '', img: p?.img ?? '', unit: p?.unit ?? '', qty: '0', qtyError: false }
}
const rows = ref<LineRow[]>([])

// ── Select product drawer — picks which SKUs (from the origin's own stock) are on
// this transfer. Existing rows keep their qty/batch/serial/location state when the
// selection changes; only newly-added SKUs get a fresh row. ──────────────────────
const drawerOpen = ref(false)
const pickerProducts = computed<PickerProduct[]>(() =>
  productOptions.value.map(o => ({ sku: o.id, name: o.name, img: o.img, desc: o.desc })),
)
const selectedSkus = computed(() => rows.value.map(r => r.sku))
function applyPicker(skus: string[]) {
  const existing = new Map(rows.value.map(r => [r.sku, r]))
  rows.value = skus.map(sku => existing.get(sku) ?? makeRow(sku))
}
function removeRow(id: number) {
  rows.value = rows.value.filter(r => r.id !== id)
}
// Origin stock left after this transfer — shown as a second line in the Available cell.
function originAfter(row: LineRow): number {
  const qty = isBatchTrackedSku(row.sku) ? batchTotal(row) : (Number(row.qty) || 0)
  return availableFor(row.sku) - qty
}

// ── Batch drawer ───────────────────────────────────────────────────────────────────
const batchDrawerRow = ref<LineRow | null>(null)
const batchDrawerOpen = computed({
  get: () => batchDrawerRow.value !== null,
  set: (v) => { if (!v) batchDrawerRow.value = null },
})
function openBatchDrawer(row: LineRow) { batchDrawerRow.value = row }
function saveBatchLines(batches: CommittedBatch[]) {
  if (!batchDrawerRow.value) return
  batchDrawerRow.value.batchLines = batches
}
function batchHasCounts(row: LineRow): boolean { return (row.batchLines ?? []).some(b => b.counted !== null) }
function batchTotal(row: LineRow): number { return (row.batchLines ?? []).reduce((s, b) => s + (b.counted ?? 0), 0) }

// ── Serial drawer ──────────────────────────────────────────────────────────────────
const serialDrawerRow = ref<LineRow | null>(null)
const serialDrawerOpen = computed({
  get: () => serialDrawerRow.value !== null,
  set: (v) => { if (!v) serialDrawerRow.value = null },
})
function openSerialDrawer(row: LineRow) {
  if (!row.qty || Number(row.qty) < 1) {
    toast.notify({ variant: 'error', title: 'Enter transfer qty first' , maxWidth: 'max-content'})
    return
  }
  serialDrawerRow.value = row
}
function saveSerialLines(serials: CommittedSerial[]) {
  if (!serialDrawerRow.value) return
  serialDrawerRow.value.serialLines = serials
}

// ── Storage location drawer ────────────────────────────────────────────────────────
// stockLocationPaths() is a sparse array with one entry per storage-capacity slot
// (a bin repeats once per unit of its capacity) — dedupe before using it as a
// dropdown's option list, or bins with capacity > 1 show up more than once.
const originLocationPaths = computed(() => [...new Set(stockLocationPaths(originId.value).filter(Boolean))])
const destLocationPaths = computed(() => [...new Set(stockLocationPaths(destId.value).filter(Boolean))])
const originHasLocations = computed(() => originLocationPaths.value.length > 0)
const destHasLocations = computed(() => destLocationPaths.value.length > 0)
// bins in origin where the drawer's SKU actually has stock
const locDrawerOriginBins = computed(() => {
  if (!locDrawerRow.value) return []
  return originStockMap.value.get(locDrawerRow.value.sku)?.locations ?? []
})
// bins in origin where the batch drawer's SKU has stock
const batchDrawerOriginBins = computed(() => {
  if (!batchDrawerRow.value) return []
  return originStockMap.value.get(batchDrawerRow.value.sku)?.locations ?? []
})
function needsLocationMgmt(row: LineRow): boolean {
  return !!row.sku && !isBatchTrackedSku(row.sku) && !isSerialTrackedSku(row.sku) && (originHasLocations.value || destHasLocations.value)
}
function locIsSet(row: LineRow): boolean {
  return !!(row.originLocations?.some(l => l.locationId && Number(l.qty) > 0) || row.destLocations?.some(l => l.locationId && Number(l.qty) > 0))
}
function locTotalFor(row: LineRow): number {
  if (row.originLocations?.length) return row.originLocations.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  return row.destLocations?.reduce((s, l) => s + (Number(l.qty) || 0), 0) ?? 0
}

interface LocQtyRow { id: number; locationId: string; qty: string }
let locRowSeq = 0
function makeLocRow(): LocQtyRow { return { id: locRowSeq++, locationId: '', qty: '' } }

const locDrawerRow = ref<LineRow | null>(null)
const locOriginRows = ref<LocQtyRow[]>([])
const locDestRows = ref<LocQtyRow[]>([])
const locSaveError = ref('')

const locOriginTotal = computed(() => locOriginRows.value.reduce((s, r) => s + (Number(r.qty) || 0), 0))
const locDestTotal = computed(() => locDestRows.value.reduce((s, r) => s + (Number(r.qty) || 0), 0))
const locAvailable = computed(() => locDrawerRow.value ? availableFor(locDrawerRow.value.sku) : 0)
const locOriginExceeds = computed(() => locOriginTotal.value > locAvailable.value)
const locDestExceeds = computed(() => locDestTotal.value > locAvailable.value)

function openLocDrawer(row: LineRow) {
  locOriginRows.value = row.originLocations?.length
    ? row.originLocations.map(l => ({ id: locRowSeq++, ...l }))
    : [makeLocRow()]
  locDestRows.value = row.destLocations?.length
    ? row.destLocations.map(l => ({ id: locRowSeq++, ...l }))
    : [makeLocRow()]
  locSaveError.value = ''
  locDrawerRow.value = row
}
function closeLocDrawer() { locDrawerRow.value = null; locActiveKey.value = null }
function addLocOriginRow() { locOriginRows.value.push(makeLocRow()) }
function addLocDestRow() { locDestRows.value.push(makeLocRow()) }
function removeLocOriginRow(id: number) { if (locOriginRows.value.length > 1) locOriginRows.value = locOriginRows.value.filter(r => r.id !== id) }
function removeLocDestRow(id: number) { if (locDestRows.value.length > 1) locDestRows.value = locDestRows.value.filter(r => r.id !== id) }

// location picker state (shared across all rows in the drawer)
const locActiveKey = ref<string | null>(null)
const locPickerSearch = ref('')
function openLocPicker(key: string) { locActiveKey.value = key; locPickerSearch.value = '' }
function closeLocPicker(key: string) { if (locActiveKey.value === key) { locActiveKey.value = null; locPickerSearch.value = '' } }
function locOptionsFor(paths: string[], rows: LocQtyRow[], currentId: string): { id: string; name: string }[] {
  const usedByOthers = new Set(rows.filter(r => r.locationId !== currentId).map(r => r.locationId))
  const q = locPickerSearch.value.trim().toLowerCase()
  return paths
    .filter(p => !usedByOthers.has(p) && (!q || p.toLowerCase().includes(q)))
    .map(p => ({ id: p, name: p }))
}
function selectLocOrigin(row: LocQtyRow, locationId: string) {
  row.locationId = locationId; locActiveKey.value = null; locPickerSearch.value = ''
  if (locOriginRows.value[locOriginRows.value.length - 1]?.id === row.id) locOriginRows.value.push(makeLocRow())
}
function selectLocDest(row: LocQtyRow, locationId: string) {
  row.locationId = locationId; locActiveKey.value = null; locPickerSearch.value = ''
  if (locDestRows.value[locDestRows.value.length - 1]?.id === row.id) locDestRows.value.push(makeLocRow())
}
async function saveLocDrawer() {
  if (!locDrawerRow.value) return
  const filledOrigin = locOriginRows.value.filter(r => r.locationId && Number(r.qty) > 0).map(({ locationId, qty }) => ({ locationId, qty }))
  const filledDest = locDestRows.value.filter(r => r.locationId && Number(r.qty) > 0).map(({ locationId, qty }) => ({ locationId, qty }))
  // if both sections are filled, their totals must match
  if (filledOrigin.length && filledDest.length && locOriginTotal.value !== locDestTotal.value) {
    locSaveError.value = `Origin total (${locOriginTotal.value}) doesn't match destination total (${locDestTotal.value})`
    return
  }
  // cap against available qty
  const total = locOriginTotal.value || locDestTotal.value
  const cap = availableFor(locDrawerRow.value.sku)
  if (total > cap) {
    locSaveError.value = `Total qty (${total}) exceeds available qty (${cap})`
    return
  }
  isSavingLoc.value = true
  await new Promise(r => setTimeout(r, 600))
  locDrawerRow.value.originLocations = filledOrigin.length ? filledOrigin : undefined
  locDrawerRow.value.destLocations = filledDest.length ? filledDest : undefined
  // qty is now derived from location totals
  locDrawerRow.value.qty = total > 0 ? String(total) : '0'
  isSavingLoc.value = false
  locDrawerRow.value = null
}

function afterTransfer(row: LineRow): number {
  const dest = onHandFor(row.sku) ?? 0
  if (isBatchTrackedSku(row.sku)) return dest + batchTotal(row)
  return dest + (Number(row.qty) || 0)
}

// Transfer qty is capped at the origin's available qty.
function setQty(row: LineRow, val: string) {
  const cap = availableFor(row.sku)
  let n = Math.max(0, Math.floor(Number(val) || 0))
  if (n > cap) n = cap
  row.qty = String(n)
  row.qtyError = false
}

// ── Search over added products ───────────────────────────────────────────────────────
const search = ref('')
const displayRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => r.productName.toLowerCase().includes(q))
})
function importProducts() { /* bulk import — not built in this prototype */ }

// ── Tags — no UI (Warehouse transfer doesn't use tags), but an existing transfer's
// tags are still prefilled + resent unchanged on save so editing one never wipes
// them out (the Details page still displays tags on already-tagged transfers). ──
function tagStrings(): string[] {
  return tags.value.map(t => String(t.text ?? t.value ?? '')).map(s => s.trim()).filter(Boolean)
}

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

// ── Prefill (edit mode) ──────────────────────────────────────────────────────────
function prefill() {
  const t = editing.value
  if (!t) return
  transactionDate.value = toDisplayDate(t.date)
  originId.value = t.originId
  destId.value = t.destinationId
  memo.value = transferMemo(t)
  tags.value = t.tags.map(tag => ({ text: tag, id: `tag-${tag}`, value: tag }))
  const lines = transferLineItems(t)
  rows.value = lines.map(l => ({ id: rowSeq++, sku: l.sku, productName: l.product.name, desc: l.product.desc, img: l.product.img, unit: l.unit, qty: String(l.qty), qtyError: false }))
}
onMounted(() => { if (isEdit.value) prefill() })

// ── Navigation + save ──────────────────────────────────────────────────────────────
function goBack() {
  if (isEdit.value) router.push(`/warehouse-transfers/${props.orderId}`)
  else router.push('/warehouse-transfers')
}
const formError = ref('')
const isSaving = ref(false)
const isSavingLoc = ref(false)
async function handleSave() {
  let valid = true
  formError.value = ''
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!originId.value) { originError.value = true; valid = false }
  if (!destId.value) { destError.value = true; valid = false }
  if (originId.value && destId.value && originId.value === destId.value) {
    destError.value = true; valid = false
    formError.value = 'Origin and destination warehouse must be different'
  }
  const filled = rows.value
  if (!filled.length) { formError.value = formError.value || 'You must add at least one product to transfer'; valid = false }
  for (const row of filled) {
    if (isBatchTrackedSku(row.sku)) {
      if (!batchHasCounts(row)) { row.qtyError = true; valid = false; formError.value = formError.value || 'You must fill in batch details for all batch-tracked products' }
      else if (batchTotal(row) > availableFor(row.sku)) { row.qtyError = true; valid = false; formError.value = formError.value || 'Transfer qty cannot exceed available stock' }
      else row.qtyError = false
    } else {
      const qty = Number(row.qty)
      if (!qty || qty < 1) { row.qtyError = true; valid = false }
      else if (qty > availableFor(row.sku)) { row.qtyError = true; valid = false; formError.value = formError.value || 'Transfer qty cannot exceed available stock' }
      else {
        row.qtyError = false
        if (isSerialTrackedSku(row.sku)) {
          const actual = row.serialLines?.length ?? 0
          if (actual !== qty) {
            formError.value = formError.value || `Enter all serial numbers for "${row.productName}" (${actual}/${qty} entered)`
            valid = false
          }
        }
      }
    }
  }
  if (!valid) { scrollToFirstError(); return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))

  const input = {
    date: toISODate(transactionDate.value),
    originId: originId.value,
    originName: warehouseName(originId.value),
    destinationId: destId.value,
    destinationName: warehouseName(destId.value),
    tags: tagStrings(),
    memo: memo.value.trim() || undefined,
    lines: filled.map(r => ({
      sku: r.sku,
      qty: isBatchTrackedSku(r.sku) ? batchTotal(r) : Number(r.qty),
      ...(r.serialLines?.length ? { serials: r.serialLines.map(cs => cs.serial) } : {}),
    })),
  }

  // Already saved — the router.push below is this function's own doing, not
  // the operator losing unsaved work, so the guard mustn't fire on it.
  disableUnsavedChangesGuard()
  if (isEdit.value) {
    updateTransfer(props.orderId, input)
    toast.notify({ variant: 'success', title: 'Warehouse transfer updated' , maxWidth: 'max-content'})
    router.push(`/warehouse-transfers/${props.orderId}`)
  } else {
    const t = addTransfer(input)
    toast.notify({ variant: 'success', title: 'Warehouse transfer created' , maxWidth: 'max-content'})
    router.push('/warehouse-transfers')
  }
}

// ── Warn before losing an in-progress transfer form — refresh/close-tab
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
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">All warehouse transfers</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEdit ? 'Edit warehouse transfer' : 'New warehouse transfer' }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">
      <div class="wtf-body">

        <!-- Header fields — 3 columns -->
        <div class="wtf-form-grid">
          <MpFormControl id="wtf-txdate" class="wtf-f-date" is-required :is-invalid="transactionDateError">
            <MpFormLabel>Transaction date</MpFormLabel>
            <div class="wtf-datepicker">
              <MpDatePicker
                id="wtf-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format"
                use-portal @update:model-value="transactionDateError = false"
              />
            </div>
            <MpFormErrorMessage>You must select transaction date</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="wtf-transno" class="wtf-f-transno">
            <div class="wtf-label-row">
              <MpFormLabel>Transaction no.</MpFormLabel>
              <span class="wtf-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
            </div>
            <MpInput id="wtf-transno-input" model-value="" placeholder="[Auto]" is-full-width is-disabled />
          </MpFormControl>

          <MpFormControl id="wtf-origin" class="wtf-f-origin" is-required :is-invalid="originError">
            <MpFormLabel>Origin warehouse</MpFormLabel>
            <MpAutocomplete
              id="wtf-origin-ac" v-model="originId" :data="warehouseOptions" label-prop="name" value-prop="id"
              placeholder="Select warehouse"
              is-searchable use-portal is-full-width :is-invalid="originError"
              @update:model-value="originError = false"
            />
            <MpFormErrorMessage>You must select origin warehouse</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="wtf-dest" class="wtf-f-dest" is-required :is-invalid="destError">
            <MpFormLabel>Destination warehouse</MpFormLabel>
            <MpAutocomplete
              id="wtf-dest-ac" v-model="destId" :data="warehouseOptions" label-prop="name" value-prop="id"
              placeholder="Select warehouse"
              is-searchable use-portal is-full-width :is-invalid="destError"
              @update:model-value="destError = false"
            />
            <MpFormErrorMessage>You must select destination warehouse</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <!-- Product table toolbar -->
        <div class="wtf-table-toolbar">
          <div class="wtf-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="wtf-search-input" type="text" placeholder="Search..." />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button class="wtf-import-btn" type="button" @click="importProducts">Import</button>
        </div>

        <!-- Product table -->
        <div class="wtf-table-section">
          <div class="wtf-table-scroll">
            <table class="wtf-table">
              <colgroup>
                <col class="wtf-col-prod" />
                <col class="wtf-col-sku" />
                <col class="wtf-col-num" />
                <col class="wtf-col-num" />
                <col class="wtf-col-num" />
                <col class="wtf-col-num" />
                <col class="wtf-col-unit" />
                <col class="wtf-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wtf-th" rowspan="2">Product</th>
                  <th class="wtf-th" rowspan="2">SKU</th>
                  <th class="wtf-th wtf-th--group" colspan="2">Origin</th>
                  <th class="wtf-th wtf-th--group" colspan="2">Destination</th>
                  <th class="wtf-th" rowspan="2">Unit</th>
                  <th class="wtf-th wtf-th--del" rowspan="2" />
                </tr>
                <tr>
                  <th class="wtf-th wtf-th--num">Available qty</th>
                  <th class="wtf-th wtf-th--num">Transfer qty</th>
                  <th class="wtf-th wtf-th--num">On hand qty</th>
                  <th class="wtf-th wtf-th--num">After transfer qty</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in displayRows" :key="row.id" class="wtf-tr">
                  <td class="wtf-td">
                    <ProductCell :name="row.productName" :desc="row.desc" :image="row.img" />
                  </td>
                  <td class="wtf-td wtf-td--muted">{{ row.sku }}</td>
                  <td class="wtf-td wtf-td--num">
                    <span class="wtf-avail">
                      <span>{{ availableFor(row.sku).toLocaleString('id-ID') }}</span>
                      <span v-if="isBatchTrackedSku(row.sku) ? batchHasCounts(row) : Number(row.qty) > 0" class="wtf-avail-after" title="Available after transfer">→ {{ originAfter(row).toLocaleString('id-ID') }}</span>
                    </span>
                  </td>
                  <!-- Transfer qty: batch — value + Manage batch stacked as 2 lines in the same cell -->
                  <td v-if="isBatchTrackedSku(row.sku)" class="wtf-td wtf-td--num">
                    <span class="wtf-qty-stack">
                      <span v-if="batchHasCounts(row)" class="wtf-batch-val">{{ batchTotal(row).toLocaleString('id-ID') }}</span>
                      <span v-else class="wtf-batch-empty">—</span>
                      <button class="wtf-manage-btn" type="button" @click="openBatchDrawer(row)">Manage batch</button>
                    </span>
                  </td>
                  <!-- Transfer qty: serial — input + Manage serial numbers stacked as 2 lines in the same cell -->
                  <td v-else-if="isSerialTrackedSku(row.sku)" class="wtf-td wtf-td--input wtf-td--input-stacked">
                    <div class="wtf-qty-stack-input">
                      <input
                        :id="`wtf-qty-${row.id}`" class="wtf-qty-input" type="number" min="0" :max="availableFor(row.sku)"
                        :value="row.qty"
                        @input="setQty(row, ($event.target as HTMLInputElement).value)"
                      />
                      <button class="wtf-manage-btn wtf-manage-btn--under-input" type="button" @click="openSerialDrawer(row)">Manage serial numbers</button>
                    </div>
                  </td>
                  <!-- Transfer qty: regular with storage location -->
                  <td v-else-if="needsLocationMgmt(row)" class="wtf-td wtf-td--num">
                    <span class="wtf-qty-stack">
                      <span v-if="locIsSet(row)" class="wtf-batch-val">{{ locTotalFor(row).toLocaleString('id-ID') }}</span>
                      <span v-else class="wtf-batch-empty">—</span>
                      <button class="wtf-manage-btn" :class="{ 'wtf-manage-btn--set': locIsSet(row) }" type="button" @click="openLocDrawer(row)">Manage storage location</button>
                    </span>
                  </td>
                  <!-- Transfer qty: regular plain -->
                  <td v-else class="wtf-td wtf-td--input">
                    <input
                      :id="`wtf-qty-${row.id}`" class="wtf-qty-input" type="number" min="0" :max="availableFor(row.sku)"
                      :value="row.qty"
                      @input="setQty(row, ($event.target as HTMLInputElement).value)"
                    />
                  </td>
                  <td class="wtf-td wtf-td--num">
                    {{ onHandFor(row.sku) === undefined ? '—' : onHandFor(row.sku)!.toLocaleString('id-ID') }}
                  </td>
                  <td class="wtf-td wtf-td--num">{{ afterTransfer(row).toLocaleString('id-ID') }}</td>
                  <td class="wtf-td wtf-td--muted">{{ row.unit }}</td>
                  <td class="wtf-td wtf-td--del">
                    <button class="wtf-del-btn" type="button" @click="removeRow(row.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </td>
                </tr>
                <tr class="wtf-tr">
                  <td class="wtf-td wtf-td--prod">
                    <button class="wtf-prod-trigger" type="button" @click="drawerOpen = true">
                      <span class="wtf-prod-placeholder">Select product</span>
                      <svg class="wtf-prod-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </td>
                  <td class="wtf-td wtf-td--empty" colspan="7" />
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wtf-count">Showing {{ displayRows.length }} of {{ rows.length }} products</div>
          <p v-if="formError" class="wtf-form-error">{{ formError }}</p>
        </div>

        <!-- Memo -->
        <div class="wtf-section wtf-section--gap-top">
          <MpFormControl id="wtf-memo">
            <MpFormLabel>Memo</MpFormLabel>
            <MpTextarea id="wtf-memo-textarea" v-model="memo" is-full-width :rows="4" />
          </MpFormControl>
          <p class="wtf-helper-text">Only visible to you and your team</p>
        </div>

        <!-- Attachment -->
        <div class="wtf-section wtf-section--last">
          <div class="wtf-section-label">Attachment</div>
          <div class="wtf-attachment">
            <input
              ref="fileInput" type="file" multiple
              accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
              class="wtf-file-hidden" @change="onFileChange"
            />
            <div class="wtf-attachment-row">
              <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">Choose file</MpButton>
              <span class="wtf-attach-or">or drag and drop here</span>
            </div>
            <p class="wtf-helper-text">File must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
            <ul v-if="attachedFiles.length" class="wtf-file-list">
              <li v-for="f in attachedFiles" :key="f.name" class="wtf-file-item">
                <span class="wtf-file-name">{{ f.name }}</span>
                <button class="wtf-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="close" size="xs" /></button>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>

    <SelectProductDrawer
      v-model:open="drawerOpen"
      :products="pickerProducts"
      :model-value="selectedSkus"
      @save="applyPicker"
    />
    <ManageBatchDrawer
      :open="batchDrawerOpen"
      :sku="batchDrawerRow?.sku ?? ''"
      :warehouse-id="originId"
      kind="transfer"
      :model-value="batchDrawerRow?.batchLines ?? []"
      :origin-location-paths="batchDrawerOriginBins"
      :dest-location-paths="destLocationPaths"
      :origin-warehouse-name="warehouseName(originId)"
      :dest-warehouse-name="warehouseName(destId)"
      @update:open="batchDrawerOpen = $event"
      @save="saveBatchLines"
    />
    <ManageSerialDrawer
      :open="serialDrawerOpen"
      :sku="serialDrawerRow?.sku ?? ''"
      :warehouse-id="originId"
      kind="transfer"
      :delta="Number(serialDrawerRow?.qty) || 0"
      :target-count="Number(serialDrawerRow?.qty) || 0"
      :model-value="serialDrawerRow?.serialLines ?? []"
      :origin-location-paths="originLocationPaths"
      :dest-location-paths="destLocationPaths"
      @update:open="serialDrawerOpen = $event"
      @save="saveSerialLines"
    />

    <!-- ── Storage location drawer ── -->
    <Transition name="wtf-loc">
    <div v-if="locDrawerRow" class="wtf-loc-overlay" @click.self="closeLocDrawer">
      <div class="wtf-loc-panel" role="dialog" aria-label="Manage storage location">
        <header class="wtf-loc-header">
          <h2 class="wtf-loc-title">Manage storage location</h2>
          <button class="wtf-loc-close" type="button" aria-label="Close" @click="closeLocDrawer">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="wtf-loc-content">
          <!-- Product info -->
          <div class="wtf-loc-product">
            <img v-if="locDrawerRow.img" class="wtf-loc-thumb" :src="locDrawerRow.img" :alt="locDrawerRow.productName" loading="lazy" />
            <span v-else class="wtf-loc-thumb wtf-loc-thumb--empty" />
            <div class="wtf-loc-names">
              <span class="wtf-loc-name">{{ locDrawerRow.productName }}</span>
              <span class="wtf-loc-sku">{{ locDrawerRow.sku }}</span>
            </div>
            <div class="wtf-loc-qty-badge">
              <span class="wtf-loc-qty-label">Available qty</span>
              <span class="wtf-loc-qty-value">{{ locDrawerRow ? availableFor(locDrawerRow.sku).toLocaleString('id-ID') : '—' }}</span>
            </div>
          </div>

          <!-- Descriptions for mixed-location scenarios -->
          <MpBanner v-if="originHasLocations && !destHasLocations" variant="info">
            <MpBannerDescription>Stock will be taken from specific bins in {{ warehouseName(originId) }} and added to the general stock in {{ warehouseName(destId) }}, which doesn't use storage locations.</MpBannerDescription>
          </MpBanner>
          <MpBanner v-if="!originHasLocations && destHasLocations" variant="info">
            <MpBannerDescription>Stock will be moved from the general stock in {{ warehouseName(originId) }} (no storage locations) and placed into specific bins in {{ warehouseName(destId) }}.</MpBannerDescription>
          </MpBanner>

          <!-- Origin locations -->
          <div v-if="originHasLocations" class="wtf-loc-section">
            <div class="wtf-loc-section-header">
              <span class="wtf-loc-section-title">Out from ({{ warehouseName(originId) }})</span>
              <span class="wtf-loc-total" :class="locOriginExceeds ? 'wtf-loc-total--warn' : ''">Total: {{ locOriginTotal }}</span>
            </div>
            <div class="wtf-loc-table-wrap"><table class="wtf-loc-table">
              <colgroup><col /><col class="wtf-loc-col-qty" /><col class="wtf-loc-col-del" /></colgroup>
              <thead>
                <tr>
                  <th class="wtf-loc-th">Storage location</th>
                  <th class="wtf-loc-th wtf-loc-th--num">Qty</th>
                  <th class="wtf-loc-th wtf-loc-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in locOriginRows" :key="r.id" class="wtf-loc-tr">
                  <td class="wtf-loc-td wtf-loc-td--sel">
                    <MpPopover :id="`wtf-loc-o-${r.id}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="closeLocPicker(`o-${r.id}`)">
                      <MpPopoverTrigger>
                        <div class="wtf-loc-trigger">
                          <input
                            class="wtf-loc-picker-input" type="text" autocomplete="off"
                            :value="locActiveKey === `o-${r.id}` ? locPickerSearch : r.locationId"
                            placeholder="Select location…"
                            @focus="openLocPicker(`o-${r.id}`)"
                            @input="locActiveKey = `o-${r.id}`; locPickerSearch = ($event.target as HTMLInputElement).value"
                          />
                          <svg class="wtf-loc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '380px', maxHeight: '260px', overflowY: 'auto', padding: '0' })">
                        <MpPopoverList>
                          <MpPopoverListItem v-for="opt in locOptionsFor(locDrawerOriginBins, locOriginRows, r.locationId)" :key="opt.id" :is-active="opt.id === r.locationId" @click="selectLocOrigin(r, opt.id)">{{ opt.name }}</MpPopoverListItem>
                          <p v-if="!locOptionsFor(locDrawerOriginBins, locOriginRows, r.locationId).length" class="wtf-loc-none">No locations found.</p>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <td class="wtf-loc-td wtf-loc-td--qty">
                    <input v-model="r.qty" class="wtf-loc-qty-input" type="number" min="0" placeholder="0" />
                  </td>
                  <td class="wtf-loc-td wtf-loc-td--del">
                    <button class="wtf-loc-del-btn" type="button" :disabled="locOriginRows.length === 1" @click="removeLocOriginRow(r.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table></div>
          </div>

          <!-- Destination locations -->
          <div v-if="destHasLocations" class="wtf-loc-section">
            <div class="wtf-loc-section-header">
              <span class="wtf-loc-section-title">Into ({{ warehouseName(destId) }})</span>
              <span class="wtf-loc-total" :class="locDestExceeds || (locOriginTotal > 0 && locDestTotal > 0 && locDestTotal !== locOriginTotal) ? 'wtf-loc-total--warn' : ''">
                Total: {{ locDestTotal }}
              </span>
            </div>
            <div class="wtf-loc-table-wrap"><table class="wtf-loc-table">
              <colgroup><col /><col class="wtf-loc-col-qty" /><col class="wtf-loc-col-del" /></colgroup>
              <thead>
                <tr>
                  <th class="wtf-loc-th">Storage location</th>
                  <th class="wtf-loc-th wtf-loc-th--num">Qty</th>
                  <th class="wtf-loc-th wtf-loc-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in locDestRows" :key="r.id" class="wtf-loc-tr">
                  <td class="wtf-loc-td wtf-loc-td--sel">
                    <MpPopover :id="`wtf-loc-d-${r.id}`" placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select @close="closeLocPicker(`d-${r.id}`)">
                      <MpPopoverTrigger>
                        <div class="wtf-loc-trigger">
                          <input
                            class="wtf-loc-picker-input" type="text" autocomplete="off"
                            :value="locActiveKey === `d-${r.id}` ? locPickerSearch : r.locationId"
                            placeholder="Select location…"
                            @focus="openLocPicker(`d-${r.id}`)"
                            @input="locActiveKey = `d-${r.id}`; locPickerSearch = ($event.target as HTMLInputElement).value"
                          />
                          <svg class="wtf-loc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '380px', maxHeight: '260px', overflowY: 'auto', padding: '0' })">
                        <MpPopoverList>
                          <MpPopoverListItem v-for="opt in locOptionsFor(destLocationPaths, locDestRows, r.locationId)" :key="opt.id" :is-active="opt.id === r.locationId" @click="selectLocDest(r, opt.id)">{{ opt.name }}</MpPopoverListItem>
                          <p v-if="!locOptionsFor(destLocationPaths, locDestRows, r.locationId).length" class="wtf-loc-none">No locations found.</p>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <td class="wtf-loc-td wtf-loc-td--qty">
                    <input v-model="r.qty" class="wtf-loc-qty-input" type="number" min="0" placeholder="0" />
                  </td>
                  <td class="wtf-loc-td wtf-loc-td--del">
                    <button class="wtf-loc-del-btn" type="button" :disabled="locDestRows.length === 1" @click="removeLocDestRow(r.id)">
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table></div>
          </div>

          <p v-if="locSaveError" class="wtf-loc-error">{{ locSaveError }}</p>
        </div>

        <footer class="wtf-loc-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="closeLocDrawer">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" :disabled="isSavingLoc" @click="saveLocDrawer">{{ isSavingLoc ? 'Saving…' : 'Save' }}</button>
        </footer>
      </div>
    </div>
    </Transition>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save') }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
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

.wtf-body { display: flex; flex-direction: column; }

/* ── Header field grid (3 × 318px, responsive shrink) ─────────────────────── */
.wtf-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 318px));
  column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-4);
  align-items: start;
}
.wtf-f-date    { grid-column: 1; grid-row: 1; }
.wtf-f-transno { grid-column: 2; grid-row: 1; }
.wtf-f-origin  { grid-column: 1; grid-row: 2; }
.wtf-f-dest    { grid-column: 2; grid-row: 2; }
.wtf-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.wtf-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.wtf-datepicker { width: 100%; }
.wtf-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* ── Table toolbar (search + import, right-aligned) ───────────────────────── */
.wtf-table-toolbar { margin-top: 32px; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); }
.wtf-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 200px; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); }
.wtf-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.wtf-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.wtf-import-btn { padding: var(--mp-spacing-2) var(--mp-spacing-4); border: 1px solid var(--mp-background-inverse, #080d0e); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-inverse, #080d0e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.wtf-import-btn:hover { opacity: 0.9; }

/* ── Table ─────────────────────────────────────────────────────────────────── */
.wtf-table-section { margin-top: var(--mp-spacing-5); }
.wtf-table-scroll { overflow-x: auto; }
.wtf-table { width: 100%; table-layout: auto; border-collapse: collapse; border-spacing: 0; min-width: 860px; }
/* Proportional column widths; the remove column hugs its icon button (width:1px →
   shrinks to min-content in auto layout) and sits at the right edge. */
.wtf-col-prod   { width: 35%; }
.wtf-col-sku    { width: 10%; }
.wtf-col-num    { width: 12%; }
.wtf-col-unit   { width: 7%; }
.wtf-col-del    { width: 52px; }
/* Form-row table: header + editable cells are white; read-only cells are grey
   (matches the picking / packing creation form-table look). */
.wtf-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.wtf-th--group { text-align: center; padding: var(--mp-spacing-1) var(--mp-spacing-2); }
.wtf-th--num { text-align: center; padding: var(--mp-spacing-1) var(--mp-spacing-2); }
.wtf-th--del { padding: 0; border-right: none; }
.wtf-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
  background: var(--mp-background-neutral-subtle);
}
.wtf-td:last-child { border-right: none; }
.wtf-td--muted { color: var(--mp-text-secondary); }
/* Empty add-row filler — plain white, spans to the right edge */
.wtf-td--empty { background: var(--mp-background-neutral, #fff); }
.wtf-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
/* Available qty cell — current available + (muted) available-after-transfer */
.wtf-avail { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.wtf-avail-after { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
/* Editable cells — white, control fills edge-to-edge, focus ring */
.wtf-td--input { padding: 0; vertical-align: top; background: var(--mp-background-neutral, #fff); }
/* Native qty input fills the cell; the cell's focus ring is the ONLY border. */
.wtf-qty-input {
  width: 100%; text-align: right;
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2);
  border: none; background: transparent; color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none;
}
/* Strip the Pixel control's own border + focus ring so it doesn't double up with the
   cell ring — single gray focus border (same grey as the search input), full row height. */
.wtf-td--input :deep([class*='input']) { border-radius: 0; border-color: transparent; box-shadow: none !important; }
.wtf-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }

/* Transfer qty (batch) — qty value + Manage batch stacked as 2 lines in one cell,
   same right-aligned column pattern as .wtf-avail above. */
.wtf-qty-stack { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 2px; }

/* Transfer qty (serial) — input on top, Manage serial numbers stacked below it,
   still edge-to-edge/no double border like every other .wtf-td--input cell. */
.wtf-td--input-stacked { padding: 0 0 6px; }
.wtf-qty-stack-input { display: flex; flex-direction: column; align-items: flex-end; }
.wtf-qty-stack-input .wtf-qty-input { height: 32px; }
.wtf-manage-btn--under-input { padding: 0 var(--mp-spacing-2); }

/* Add-product row — Product cell looks like a closed MpSelect; click opens SelectProductDrawer */
.wtf-td--prod { padding: 0; vertical-align: top; background: var(--mp-background-neutral, #fff); }
.wtf-prod-trigger {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2);
  border: none; background: none; cursor: pointer; font-family: inherit;
}
.wtf-prod-placeholder { font-size: var(--mp-font-sizes-md); color: var(--mp-text-placeholder); }
.wtf-prod-chevron { flex-shrink: 0; color: var(--mp-icon-default); }

.wtf-td--del { padding: 0; text-align: center; }
.wtf-del-btn { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 40px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); }
.wtf-del-btn:hover { background: var(--mp-background-neutral); color: var(--mp-text-danger, #dc2626); }
.wtf-count { padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.wtf-form-error { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

/* ── Batch / serial value spans ──────────────────────────────────────────── */
.wtf-batch-val { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.wtf-batch-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Manage batch/serial/location links — now stacked inside the Transfer qty cell ── */
.wtf-manage-btn { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.wtf-manage-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.wtf-manage-btn--set { color: var(--mp-text-success, #18794e); }

/* ── Memo + Attachment ───────────────────────────────────────────────────── */
.wtf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; padding: var(--mp-spacing-6) 0; }
.wtf-section--gap-top { padding-top: 32px; padding-bottom: 0; }
.wtf-section--last { padding-top: 20px; }
.wtf-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
.wtf-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.wtf-file-hidden { display: none; }
.wtf-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wtf-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.wtf-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wtf-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.wtf-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.wtf-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtf-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.wtf-file-remove:hover { color: var(--mp-text-default); }

/* ── Storage location drawer ─────────────────────────────────────────────── */
.wtf-loc-enter-active,
.wtf-loc-leave-active { transition: background-color 250ms ease; }
.wtf-loc-enter-from, .wtf-loc-leave-to { background-color: transparent; }
.wtf-loc-enter-active :deep(.wtf-loc-panel) { transition: transform 350ms ease-out; }
.wtf-loc-leave-active :deep(.wtf-loc-panel) { transition: transform 250ms ease-in; }
.wtf-loc-enter-from :deep(.wtf-loc-panel),
.wtf-loc-leave-to :deep(.wtf-loc-panel) { transform: translateX(calc(100% + 12px)); }

.wtf-loc-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.wtf-loc-panel {
  margin: var(--mp-spacing-3);
  width: min(720px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.wtf-loc-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.wtf-loc-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); }
.wtf-loc-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border: none; background: none;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default);
}
.wtf-loc-close:hover { background: var(--mp-background-neutral-hovered); }
.wtf-loc-content { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px; }

.wtf-loc-product {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.wtf-loc-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle); background: var(--mp-background-neutral);
}
.wtf-loc-thumb--empty { background: var(--mp-background-neutral-subtle); }
.wtf-loc-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.wtf-loc-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtf-loc-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wtf-loc-qty-badge { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; flex-shrink: 0; }
.wtf-loc-qty-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.wtf-loc-qty-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

.wtf-loc-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wtf-loc-section-header { display: flex; align-items: center; justify-content: space-between; }
.wtf-loc-section-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wtf-loc-total { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.wtf-loc-total--warn { color: var(--mp-text-warning, #b45309); font-weight: var(--mp-font-weights-medium); }

.wtf-loc-table-wrap { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.wtf-loc-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
.wtf-loc-col-qty { width: 80px; }
.wtf-loc-col-del { width: 44px; }
.wtf-loc-th {
  height: 28px; padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase; text-align: left;
  border-bottom: 1px solid var(--mp-border-default);
}
.wtf-loc-th--num { text-align: right; }
.wtf-loc-th--del { padding: 0; }
.wtf-loc-tr .wtf-loc-td { border-bottom: 1px solid var(--mp-border-default); }
.wtf-loc-tr:last-child .wtf-loc-td { border-bottom: none; }
.wtf-loc-td { background: var(--mp-background-neutral, #fff); padding: 0; vertical-align: top; }
.wtf-loc-td--sel:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.wtf-loc-td--qty { text-align: right; }
.wtf-loc-td--qty:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.wtf-loc-td--del { text-align: center; }
.wtf-loc-trigger { display: flex; align-items: center; height: 40px; padding: 0 var(--mp-spacing-2); gap: var(--mp-spacing-1); }
.wtf-loc-picker-input {
  flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-family: inherit;
}
.wtf-loc-picker-input::placeholder { color: var(--mp-text-placeholder); }
.wtf-loc-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.wtf-loc-none { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.wtf-loc-qty-input {
  width: 100%; height: 40px; padding: 0 var(--mp-spacing-2);
  border: none; outline: none; background: transparent; text-align: right;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-family: inherit;
  font-variant-numeric: tabular-nums;
}
.wtf-loc-del-btn {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: 40px; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary);
}
.wtf-loc-del-btn:hover:not(:disabled) { color: var(--mp-text-danger, #dc2626); }
.wtf-loc-del-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.wtf-loc-add-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link);
}
.wtf-loc-add-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.wtf-loc-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }
.wtf-loc-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-stage);
}
</style>
